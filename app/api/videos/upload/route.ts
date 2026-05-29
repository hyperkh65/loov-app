import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExecWithStdin, nasExec } from '@/lib/nas-ssh';
import path from 'path';

const VIDEO_DIR = '/volumeUSB1/usbshare/videos';
const VIDEO_PIN = process.env.VIDEO_PIN || '0506';

export const maxDuration = 600;

function safeName(filename: string) {
  return path.basename(filename)
    .replace(/[^\w가-힣.\-\s()]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const form = await req.formData();
  const pin = (form.get('pin') as string) || req.headers.get('x-video-pin');
  if (pin !== VIDEO_PIN) return NextResponse.json({ error: '비밀번호 오류' }, { status: 403 });

  const chunk = form.get('chunk') as File | null;
  const filename = form.get('filename') as string | null;
  const chunkIndex = parseInt((form.get('chunkIndex') as string) || '0');
  const totalChunks = parseInt((form.get('totalChunks') as string) || '1');

  if (!chunk || !filename) return NextResponse.json({ error: '데이터 없음' }, { status: 400 });

  const name = safeName(filename);
  if (!name) return NextResponse.json({ error: '잘못된 파일명' }, { status: 400 });

  await nasExec(`mkdir -p "${VIDEO_DIR}"`);
  const videoPath = `${VIDEO_DIR}/${name}`;
  const buffer = Buffer.from(await chunk.arrayBuffer());

  const cmd = chunkIndex === 0 ? `cat > "${videoPath}"` : `cat >> "${videoPath}"`;
  const result = await nasExecWithStdin(cmd, buffer);
  if (result.code !== 0) return NextResponse.json({ error: '쓰기 실패: ' + result.stderr }, { status: 500 });

  const done = chunkIndex === totalChunks - 1;
  let finalSize = 0;
  if (done) {
    const sr = await nasExec(`stat -c%s "${videoPath}" 2>/dev/null || echo 0`);
    finalSize = parseInt(sr.stdout.trim()) || 0;
  }

  return NextResponse.json({ success: true, done, finalSize, filename: name });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { filename, pin } = await req.json();
  if (pin !== VIDEO_PIN) return NextResponse.json({ error: '비밀번호 오류' }, { status: 403 });

  const name = safeName(filename);
  if (!name) return NextResponse.json({ error: '잘못된 파일명' }, { status: 400 });

  await nasExec(`rm -f "${VIDEO_DIR}/${name}"`);
  return NextResponse.json({ success: true });
}
