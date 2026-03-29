import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { listFiles, readFileAsBase64 } from '@/lib/nas-sftp';

const NAS_GALLERY_ROOT = '/volume1/homes/urjent/gallery';
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'];

function isImage(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTS.includes(ext);
}

// GET ?action=list&path=subfolder  → 폴더 목록 + 이미지 목록
// GET ?action=image&path=file.jpg  → 이미지 base64 반환
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action') || 'list';
  const relPath = req.nextUrl.searchParams.get('path') || '';
  // 경로 탈출 방지
  const safePath = relPath.replace(/\.\./g, '').replace(/^\//, '');
  const fullPath = safePath ? `${NAS_GALLERY_ROOT}/${safePath}` : NAS_GALLERY_ROOT;

  if (action === 'list') {
    try {
      const files = await listFiles(fullPath);
      const folders = files.filter(f => f.isDir).map(f => ({ name: f.name, isDir: true }));
      const images = files.filter(f => !f.isDir && isImage(f.name)).map(f => ({
        name: f.name,
        path: safePath ? `${safePath}/${f.name}` : f.name,
        size: f.size,
        modTime: f.modTime,
      }));
      return NextResponse.json({ folders, images, currentPath: safePath });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  if (action === 'image') {
    if (!safePath) return NextResponse.json({ error: 'path 필요' }, { status: 400 });
    try {
      const base64 = await readFileAsBase64(fullPath);
      const ext = safePath.split('.').pop()?.toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png'
        : ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
        : 'image/jpeg';
      const buf = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
      return new NextResponse(buf, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'action 필요 (list|image)' }, { status: 400 });
}

// POST { folder: 'subfolder' } → 하위 폴더 생성
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { folder } = await req.json() as { folder: string };
  if (!folder) return NextResponse.json({ error: 'folder 필요' }, { status: 400 });
  const safeName = folder.replace(/[^a-zA-Z0-9가-힣_\-\s]/g, '').trim();
  if (!safeName) return NextResponse.json({ error: '유효하지 않은 폴더명' }, { status: 400 });

  const { nasExec } = await import('@/lib/nas-ssh');
  const result = await nasExec(`mkdir -p "${NAS_GALLERY_ROOT}/${safeName}"`);
  if (result.code !== 0) return NextResponse.json({ error: result.stderr }, { status: 500 });
  return NextResponse.json({ ok: true, path: safeName });
}
