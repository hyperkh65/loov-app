/**
 * 발행된 기사를 영어/일본어로 번역해서 engmag.2days.kr / japmag.2days.kr에 크로스 발행.
 * Groq(무료 티어, gw 그룹웨어에도 쓰는 것과 동일 계정군)로 번역 — 하루 호출량이
 * 많아질 수 있어(기사당 EN+JA 2회) 키 여러 개를 라운드로빈으로 나눠 쓴다.
 */
import { getSetting } from '@/lib/get-setting';
import { publishToWordPress, getWpCredentials } from '@/lib/scheduler/blog-runner';
import { createAdminClient } from '@/lib/supabase-server';
import { publishToTumblr } from '@/lib/tumblr-publish';
import { publishToLinkedIn } from '@/lib/linkedin-publish';
import { publishToWordpressCom } from '@/lib/wordpress-com';
import { publishToGithubPages } from '@/lib/github-pages-blog';

const GROQ_MODEL = 'qwen/qwen3.8-27b';
const TARGETS: Record<'en' | 'ja', string> = {
  en: 'https://engmag.2days.kr',
  ja: 'https://japmag.2days.kr',
};

let keyIdx = 0;
async function groqKeys(): Promise<string[]> {
  const raw = await getSetting('GROQ_API_KEYS');
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

// 이 키의 무료 티어는 분당 8000토큰(TPM) 제한이라(직접 확인 — 429로 명시됨),
// 기사 하나 프롬프트만으로도 5000~6000토큰을 먹어서 키 하나로는 쉽게 한도를
// 넘긴다. 4개 키를 돌아가며 시도하고, 그래도 다 걸리면 한도가 리셋되는
// 60초를 기다렸다가 한 바퀴 더 돈다(이 작업은 사람이 기다리는 동기 요청이
// 아니라 발행 파이프라인 안에서 도는 거라 대기해도 무방).
async function fetchGroqChat(body: Record<string, unknown>): Promise<{ content: string; finishReason?: string }> {
  const keys = await groqKeys();
  if (!keys.length) throw new Error('GROQ_API_KEYS 설정 없음');

  let lastErr = '';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[keyIdx % keys.length];
      keyIdx++;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });
        if (res.status === 429) { lastErr = `429 rate limit (key ${i})`; continue; }
        if (!res.ok) throw new Error(`Groq 번역 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
        const data = await res.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
        return { content: data.choices?.[0]?.message?.content || '', finishReason: data.choices?.[0]?.finish_reason };
      } catch (e) {
        if ((e as Error).message?.startsWith('Groq 번역 실패')) throw e;
        lastErr = (e as Error).message;
      }
    }
    if (pass === 0) await new Promise(r => setTimeout(r, 60_000)); // TPM 한도 리셋 대기
  }
  throw new Error(`Groq 번역 실패 — 키 4개 모두 rate limit: ${lastErr}`);
}

const LANG_NAME: Record<'en' | 'ja', string> = { en: '영어', ja: '일본어' };

export async function translateArticle(
  title: string, content: string, targetLang: 'en' | 'ja',
): Promise<{ title: string; content: string }> {
  const prompt = `다음은 한국어 블로그 기사다. 제목과 본문을 자연스러운 ${LANG_NAME[targetLang]}로 번역하라.
- 본문은 HTML이다 — 모든 태그(<h2>, <figure>, <img>, style 속성 등)와 구조는 그대로 유지하고, 태그 안의 텍스트 내용만 번역하라.
- 번역 외의 설명이나 주석을 절대 덧붙이지 마라.
- 아래 형식 그대로 출력하라(마커 포함):

===TITLE===
(번역된 제목)

===CONTENT===
(번역된 본문 HTML)

===원본 제목===
${title}

===원본 본문===
${content}`;

  // Groq는 max_tokens 안 넣으면 기본값 2048에서 뚝 끊김(finish_reason:"length") —
  // 원문 하나가 6개 섹션짜리라 실사용 중 2번째 섹션에서 잘리는 걸 직접 확인함
  const { content: raw, finishReason } = await fetchGroqChat({
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 8000,
  });
  if (finishReason === 'length') {
    throw new Error('번역 응답이 max_tokens 한도에서 다시 잘림 — 원문이 예상보다 길 수 있음');
  }

  const titleMatch = raw.match(/===TITLE===\s*([\s\S]*?)\s*===CONTENT===/);
  const contentMatch = raw.match(/===CONTENT===\s*([\s\S]*)/);
  const translatedTitle = titleMatch?.[1]?.trim();
  const translatedContent = contentMatch?.[1]?.trim();
  if (!translatedTitle || !translatedContent) throw new Error('번역 응답 파싱 실패 — 마커 없음');

  return { title: translatedTitle, content: translatedContent };
}

/**
 * 원문이 워드프레스에 발행된 직후 호출 — 영어/일본어 번역본을 각각
 * engmag.2days.kr / japmag.2days.kr에 발행한다. 한쪽이 실패해도 다른 쪽/원본
 * 발행에는 영향 없게 독립적으로 처리(lib/rewrite-publish.ts의 부분 실패 허용 패턴과 동일).
 */
export async function translateAndCrossPost(
  article: { title: string; content: string; representative_image_url: string | null },
): Promise<Record<'en' | 'ja', string>> {
  const results: Record<'en' | 'ja', string> = { en: 'skip', ja: 'skip' };
  const admin = createAdminClient();

  await Promise.all((['en', 'ja'] as const).map(async (lang) => {
    try {
      const { data: site } = await admin
        .from('wordpress_sites')
        .select('id')
        .eq('site_url', TARGETS[lang])
        .single();
      if (!site) { results[lang] = 'skip: 사이트 없음'; return; }

      const translated = await translateArticle(article.title, article.content, lang);
      const creds = await getWpCredentials(site.id);
      const result = await publishToWordPress(
        creds.url, creds.username, creds.appPassword,
        translated.title, translated.content, article.representative_image_url,
      );
      results[lang] = `ok: ${result.link}`;

      // 네이버카페는 한국 독자 전용이라 제외 — 대신 이미 연동된 국제 채널
      // (텀블러/링크드인/워드프레스닷컴/깃헙페이지)로 해외 유입/백링크 확보.
      // 실패해도 본 발행에는 영향 없음(fire-and-forget, 기존 blog-runner.ts 패턴과 동일)
      publishToTumblr({ title: translated.title, canonical_url: result.link }).catch(() => {});
      publishToLinkedIn({ title: translated.title, canonical_url: result.link }).catch(() => {});
      publishToWordpressCom({ title: translated.title, content: translated.content, articleUrl: result.link }).catch(() => {});
      publishToGithubPages({ title: translated.title, content: translated.content, articleUrl: result.link }).catch(() => {});
    } catch (e) {
      results[lang] = `error: ${(e as Error).message?.slice(0, 150)}`;
    }
  }));

  return results;
}
