import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { NASQ_DIR } from '@/lib/shorts-nasq';

// 몽글 꿀팁 보관함(NAS): 딸깍이 꿀팁마다 영상·가이드 PDF·게시 글(post.txt)·원본 JSON을 올려 두고, 필요할 때 꺼내 간다. 딸깍 토큰(Bearer)만
const DIR = path.join(NASQ_DIR, 'mongle');
const safe = (s: string) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(s);
const safeFile = (s: string) => /^[\w.-]{1,80}$/.test(s) && !s.startsWith('.');

export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const fd = await req.formData(), slug = String(fd.get('slug') || '');
  if (!safe(slug)) return NextResponse.json({ error: 'slug 형식 오류' }, { status: 400 });
  const dir = path.join(DIR, slug); fs.mkdirSync(dir, { recursive: true });
  const saved: string[] = [];
  for (const f of fd.getAll('files')) {
    if (!(f instanceof File) || !safeFile(f.name)) continue;
    fs.writeFileSync(path.join(dir, f.name), Buffer.from(await f.arrayBuffer())); saved.push(f.name);
  }
  return NextResponse.json({ ok: true, slug, saved });
}

// ?slug 없음 → 목록, ?slug → 파일 목록, ?slug&file → 파일 내려받기
export async function GET(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const slug = req.nextUrl.searchParams.get('slug') || '', file = req.nextUrl.searchParams.get('file') || '';
  if (!slug) {
    const list = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(safe).map(s => ({ slug: s, at: fs.statSync(path.join(DIR, s)).mtimeMs })).sort((a, b) => b.at - a.at) : [];
    return NextResponse.json({ list });
  }
  if (!safe(slug)) return NextResponse.json({ error: 'slug 형식 오류' }, { status: 400 });
  const dir = path.join(DIR, slug);
  if (!fs.existsSync(dir)) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (!file) return NextResponse.json({ slug, files: fs.readdirSync(dir).filter(safeFile) });
  if (!safeFile(file) || !fs.existsSync(path.join(dir, file))) return NextResponse.json({ error: '없음' }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(path.join(dir, file))), { headers: { 'Content-Disposition': `attachment; filename="${file}"` } });
}
