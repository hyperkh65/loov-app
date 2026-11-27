// 블로그 사진 후보 검사 — Gemini가 이미지를 직접 보고 "주제 관련 + 로고·워터마크·글자 합성·화면 캡처 없음"만 통과시킨다.
// LOOV 블로그 작가 2(포털 사진 방식)가 확인 없이 아무 사진이나 쓰던 문제(워터마크·무관 사진) 때문에 만들었다.
import { getGeminiKeys } from '@/lib/ai-call';

export type ScreenedPhoto = { url: string; desc: string };
const MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];

async function load(url: string): Promise<{ mime: string; b64: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5_000 || buf.length > 8_000_000) return null;
    return { mime, b64: buf.toString('base64') };
  } catch { return null; }
}

async function judge(keyword: string, img: { mime: string; b64: string }, keys: string[]): Promise<{ ok: boolean; desc: string } | null> {
  const prompt = `블로그 글 주제: "${keyword}"
이 이미지를 이 글의 본문 사진으로 써도 되는지 판단해 JSON 한 줄로만 답해:
{"relevant": 글 내용을 보여주는 데 도움이 되는 사진이면 true — 주제의 물건·장소·상황·사람이 보이면 된다(예: 김장 배추 가격 글에 배추·김장 장면). 단, 주제가 특정 실존 인물(연예인·정치인 등)이면 그 인물 본인임이 분명한 사진만 true이고 다른 사람·모르는 사람 사진은 false,
 "overlay": 아래 중 하나라도 있으면 true — ① 사진의 아래쪽(하단 1/3)이나 가운데에 있는 로고·워터마크·사이트 마크·"@아이디"·저작권/출처 문구 ①-2 방송사·언론사 마크(JTBC·KBS·MBC·SBS·tvN·YTN 등)는 위치와 상관없이(모서리의 작은 것도) 포함 ①-3 방송 화면 캡처나 예능·드라마 홍보 카드(출연자 얼굴+자막 디자인) ② 사진 위에 얹은 홍보 문구나 큰 제목 글자 ③ 웹사이트·앱 화면 캡처. (사진 위쪽 모서리의 작은 표시, 사진 속 실제 간판·제품 글씨는 괜찮다)
 "desc": "무엇이 보이는지 한국어 15자 이내"}`;
  for (const model of MODELS) for (const key of keys.slice(0, 2)) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: img.mime, data: img.b64 } }, { text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
      });
      if (!res.ok) continue;
      const txt = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const j = JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, '')) as { relevant?: boolean; overlay?: boolean; desc?: string };
      return { ok: j.relevant === true && j.overlay === false, desc: String(j.desc || '').slice(0, 30) };
    } catch { /* 다음 키·모델 */ }
  }
  return null; // 판단 실패 → 쓰지 않는다
}

/** 후보 주소들을 검사해 통과한 것만 순서대로 돌려준다(최대 max장) */
export async function screenPhotos(keyword: string, urls: string[], max = 6): Promise<ScreenedPhoto[]> {
  const keys = await getGeminiKeys();
  if (!keys.length) return [];
  const out = await Promise.all(urls.slice(0, 28).map(async (url) => {
    const img = await load(url);
    if (!img) return null;
    const r = await judge(keyword, img, keys);
    return r?.ok ? { url, desc: r.desc } : null;
  }));
  return out.filter((x): x is ScreenedPhoto => !!x).slice(0, max);
}

/** 기사·웹 문서의 대표 사진(og:image) 주소 모으기 — 네이버 이미지 검색 후보가 적은 주제(제도·행정 등)를 보충 */
export async function ogImages(pageUrls: string[], max = 8): Promise<string[]> {
  const got = await Promise.all(pageUrls.slice(0, max).map(async (u) => {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(6_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;
      const html = (await res.text()).slice(0, 200_000);
      const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const img = m?.[1]?.replace(/&amp;/g, '&');
      return img && img.startsWith('http') ? img : null;
    } catch { return null; }
  }));
  return [...new Set(got.filter((x): x is string => !!x))];
}
