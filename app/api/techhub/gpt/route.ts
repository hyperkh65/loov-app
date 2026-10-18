import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { uploadToR2 } from '@/lib/r2-storage';
import { pendingGptJob, currentGptJob, saveGptResult, type GptResult } from '@/lib/techhub/gpt-queue';

export const maxDuration = 60;

// 맥(딸깍)이 10초마다 와서 작업을 가져가고 결과(대표이미지 PNG base64 + 계정별 캡션)를 올린다.
export async function GET(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ job: await pendingGptJob() });
}

export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const job = await currentGptJob();
  if (!job || job.id !== b.id) return NextResponse.json({ error: '작업 없음/만료' }, { status: 404 });
  const out: GptResult = {};
  if (typeof b.image_b64 === 'string' && b.image_b64.length > 1000) {
    const buf = await sharp(Buffer.from(b.image_b64, 'base64')).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    if (buf.length > 20_000) out.coverUrl = await uploadToR2(`techhub/${job.slug}/gpt-cover.jpg`, buf, 'image/jpeg');
  }
  if (b.captions && typeof b.captions === 'object') out.captions = b.captions;
  await saveGptResult(job.id, out);
  return NextResponse.json({ ok: true, cover: !!out.coverUrl, captions: Object.keys(out.captions || {}) });
}
