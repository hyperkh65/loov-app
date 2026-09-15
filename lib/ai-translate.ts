/**
 * 발행된 기사를 영어/일본어로 번역해서 engmag.2days.kr / japmag.2days.kr에 크로스 발행.
 * Groq(무료 티어, gw 그룹웨어에도 쓰는 것과 동일 계정군)로 번역 — 하루 호출량이
 * 많아질 수 있어(기사당 EN+JA 2회) 키 여러 개를 라운드로빈으로 나눠 쓴다.
 */
import { getSetting } from '@/lib/get-setting';
import { publishToWordPress, getWpCredentials } from '@/lib/scheduler/blog-runner';
import { createAdminClient } from '@/lib/supabase-server';

const GROQ_MODEL = 'qwen/qwen3.8-27b';
const TARGETS: Record<'en' | 'ja', string> = {
  en: 'https://engmag.2days.kr',
  ja: 'https://japmag.2days.kr',
};

let keyIdx = 0;
async function nextGroqKey(): Promise<string | null> {
  const raw = await getSetting('GROQ_API_KEYS');
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.length) return null;
  const key = keys[keyIdx % keys.length];
  keyIdx++;
  return key;
}

const LANG_NAME: Record<'en' | 'ja', string> = { en: '영어', ja: '일본어' };

export async function translateArticle(
  title: string, content: string, targetLang: 'en' | 'ja',
): Promise<{ title: string; content: string }> {
  const key = await nextGroqKey();
  if (!key) throw new Error('GROQ_API_KEYS 설정 없음');

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

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Groq 번역 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content || '';

  const titleMatch = raw.match(/===TITLE===\s*([\s\S]*?)(?===CONTENT===)/);
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
    } catch (e) {
      results[lang] = `error: ${(e as Error).message?.slice(0, 150)}`;
    }
  }));

  return results;
}
