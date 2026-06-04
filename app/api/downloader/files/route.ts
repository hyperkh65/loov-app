import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const DL_PATH = '/volume1/homes/urjent/missav_downloads';

export async function GET() {
  const res = await nasExec(`ls -la --time-style=+"%Y-%m-%d %H:%M" "${DL_PATH}" 2>/dev/null`);
  if (res.code !== 0) return NextResponse.json({ files: [] });

  const files = res.stdout.split('\n')
    .filter(line => {
      if (!line.trim() || line.startsWith('total') || line.startsWith('d')) return false;
      const name = line.split(/\s+/).slice(8).join(' ');
      return name && !name.startsWith('.') && /\.(mp4|mkv|avi|webm|mov|ts|m4v|flv)$/i.test(name);
    })
    .map(line => {
      const parts = line.split(/\s+/);
      const size = parseInt(parts[4] || '0');
      const date = `${parts[5]} ${parts[6]}`;
      const name = parts.slice(7).join(' ');
      return { name, size, date, sizeMB: (size / 1024 / 1024).toFixed(1) };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Check for subtitle files too
  const srtRes = await nasExec(`ls "${DL_PATH}"/*.srt 2>/dev/null || echo ""`);
  const srtFiles = srtRes.stdout.split('\n').map(f => f.split('/').pop()?.replace('.srt', '')).filter(Boolean);

  return NextResponse.json({ files: files.map(f => ({ ...f, hasSrt: srtFiles.includes(f.name.replace(/\.[^.]+$/, '')) })) });
}

export async function DELETE(req: NextRequest) {
  const { filename } = await req.json() as { filename: string };
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  const res = await nasExec(`rm -f "${DL_PATH}/${filename}"`);
  // Also delete .srt if exists
  await nasExec(`rm -f "${DL_PATH}/${filename.replace(/\.[^.]+$/, '')}.srt"`);
  return NextResponse.json({ success: res.code === 0 });
}
