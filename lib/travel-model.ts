import { getSetting } from '@/lib/get-setting';
import { uploadToR2 } from '@/lib/r2-storage';

// 여행 계정 고정 모델(가상 인물) — 외모 묘사를 고정하고 기준 사진을 gpt-image-1 편집 API에 함께 넣어 동일 인물을 유지
export const MODEL_PROMPT = 'the same young Korean woman in her late 20s from the reference photo: long dark brown-black wavy hair with soft side-swept bangs, fair skin, soft natural smile, black sunglasses (worn on face or pushed up on head), natural makeup with coral-rose lips, stylish casual travel outfit';
const REF_URL = `${(process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr').replace(/\/$/, '')}/travel-model/ref.jpg`;
export const AI_IMAGE_NOTE = '※ 이미지는 AI로 생성한 가상 모델 사진이에요.';

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return r.ok ? await r.blob() : null;
  } catch { return null; }
}

/** 모델이 장면에 등장하는 실사 사진을 만든다. baseUrl이 있으면 그 사진(호텔 등)에 모델을 합성, 없으면 scene 묘사대로 새로 생성. 실패 시 null */
export async function composeModelScene(scene: string, baseUrl?: string, size: '1024x1024' | '1536x1024' = '1536x1024'): Promise<string | null> {
  const apiKey = await getSetting('OPENAI_API_KEY');
  if (!apiKey) return null;
  const ref = await fetchBlob(REF_URL);
  if (!ref) return null;
  const base = baseUrl ? await fetchBlob(baseUrl) : null;
  if (baseUrl && !base) return null;

  const prompt = base
    ? `Image 1 is a real photo of a place. Image 2 is a reference photo of ${MODEL_PROMPT}. Edit image 1: naturally add that exact same woman (same face, hair, sunglasses) to the scene as a traveler. ${scene} Keep the place's architecture, furniture and layout unchanged. Match lighting, perspective and shadows so it looks like a genuine candid photo taken on location. Photorealistic, natural skin texture. No text, no logos, no watermark.`
    : `Image 1 is a reference photo of ${MODEL_PROMPT}. Create a new photorealistic candid travel photo of that exact same woman (same face, hair, sunglasses). ${scene} Natural light, authentic skin texture, shot like an iPhone/35mm travel snapshot. No text, no logos, no watermark.`;

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', 'medium');
  form.append('output_format', 'jpeg');
  form.append('input_fidelity', 'high');
  if (base) form.append('image[]', base, 'place.jpg');
  form.append('image[]', ref, 'model.jpg');
  try {
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(150_000),
    });
    const data = await res.json().catch(() => ({})) as { data?: { b64_json?: string }[]; error?: { message?: string } };
    const b64 = data.data?.[0]?.b64_json;
    if (!res.ok || !b64) { console.error('[travel-model] 실패', res.status, data.error?.message); return null; }
    return await uploadToR2(`ai/model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`, Buffer.from(b64, 'base64'), 'image/jpeg');
  } catch (e) { console.error('[travel-model] 예외', e); return null; }
}
