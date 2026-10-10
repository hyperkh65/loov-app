import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

const VIDEO_DIR = '/volumeUSB1/usbshare/videos';
const VIDEO_PIN = process.env.VIDEO_PIN || '0506';
const VIDEO_EXTS = /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv|ts|mts|3gp|hevc|h265)$/i;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const pin = req.headers.get('x-video-pin');
  if (pin !== VIDEO_PIN) return NextResponse.json({ error: '비밀번호 오류' }, { status: 403 });

  await nasExec(`mkdir -p "${VIDEO_DIR}"`);
  const r = await nasExec(`ls -la --time-style=+%s "${VIDEO_DIR}" 2>&1`);

  const files: { name: string; size: number; modTime: number }[] = [];
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('total') || /\s\.\s|\s\.\.\s/.test(line)) continue;
    const m = line.match(/^[d\-l][rwxst+\-]{9}[\+@\.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!m || line.startsWith('d')) continue;
    const name = m[3].trim();
    if (!VIDEO_EXTS.test(name)) continue;
    files.push({ name, size: parseInt(m[1]) || 0, modTime: parseInt(m[2]) || 0 });
  }

  return NextResponse.json({ files: files.sort((a, b) => b.modTime - a.modTime) });
}
