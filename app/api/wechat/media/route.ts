/**
 * WeChat 미디어 API
 * GET /api/wechat/media?room_id=X&type=images  — 이미지 목록
 * GET /api/wechat/media?room_id=X&type=files   — 파일 목록
 * GET /api/wechat/media?serve=attach/hash/YYYY-MM/Img/file.dat  — 이미지 제공 (XOR 디코딩)
 * GET /api/wechat/media?serve=file/YYYY-MM/name.xlsx            — 파일 다운로드
 */
import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';
import crypto from 'crypto';

const NAS_MEDIA = '/volume1/homes/urjent/wechat_backup/media';

// .dat XOR 복호화 (WeChat 이미지)
function decodeDat(buf: Buffer): { data: Buffer; ext: string; mime: string } {
  if (buf.length < 4) return { data: buf, ext: 'jpg', mime: 'image/jpeg' };

  // 후보 포맷별 magic bytes
  const candidates: Array<{ magic: number[]; ext: string; mime: string }> = [
    { magic: [0xFF, 0xD8, 0xFF], ext: 'jpg', mime: 'image/jpeg' },
    { magic: [0x89, 0x50, 0x4E, 0x47], ext: 'png', mime: 'image/png' },
    { magic: [0x47, 0x49, 0x46], ext: 'gif', mime: 'image/gif' },
    { magic: [0x42, 0x4D], ext: 'bmp', mime: 'image/bmp' },
    { magic: [0x52, 0x49, 0x46, 0x46], ext: 'webp', mime: 'image/webp' },
  ];

  for (const { magic, ext, mime } of candidates) {
    const key = buf[0] ^ magic[0];
    // 두 번째 바이트도 검증
    if (magic.length > 1 && (buf[1] ^ key) !== magic[1]) continue;
    if (magic.length > 2 && (buf[2] ^ key) !== magic[2]) continue;
    const decoded = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) decoded[i] = buf[i] ^ key;
    return { data: decoded, ext, mime };
  }

  // 폴백: key=0 (이미 디코딩됨)
  return { data: buf, ext: 'jpg', mime: 'image/jpeg' };
}

// 파일 확장자 → MIME
function getMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    mp4: 'video/mp4',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // ── 파일/이미지 제공 ──
  const servePath = searchParams.get('serve');
  if (servePath) {
    // Path traversal 방지
    const safe = servePath.replace(/\.\./g, '').replace(/\/+/g, '/').replace(/^\//, '');
    const fullPath = `${NAS_MEDIA}/${safe}`;

    try {
      // SSH로 파일 읽기 (base64 인코딩해서 전송)
      const result = await nasExec(`base64 "${fullPath}" 2>/dev/null`);
      if (!result.stdout) {
        return NextResponse.json({ error: '파일 없음' }, { status: 404 });
      }

      const raw = Buffer.from(result.stdout.replace(/\s/g, ''), 'base64');
      const filename = safe.split('/').pop() ?? 'file';

      if (filename.endsWith('.dat')) {
        const { data, mime } = decodeDat(raw);
        return new NextResponse(data.buffer as ArrayBuffer, {
          headers: {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }

      const mime = getMime(filename);
      const isInline = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('video/');
      return new NextResponse(raw.buffer as ArrayBuffer, {
        headers: {
          'Content-Type': mime,
          'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // ── 목록 조회 ──
  const roomId = searchParams.get('room_id');
  const type = searchParams.get('type') ?? 'images';

  if (!roomId) return NextResponse.json({ error: 'room_id 필요' }, { status: 400 });

  try {
    if (type === 'images') {
      const roomHash = crypto.createHash('md5').update(roomId).digest('hex');
      const result = await nasExec(
        `find "${NAS_MEDIA}/attach/${roomHash}" -name "*.dat" ! -name "*_t.dat" ! -name "*_h.dat" 2>/dev/null | sort -r | head -200`
      );
      const paths = result.stdout.split('\n').filter(Boolean).map(p =>
        p.replace(`${NAS_MEDIA}/`, '')
      );
      return NextResponse.json({ paths, count: paths.length });
    }

    if (type === 'files') {
      // 파일은 날짜 폴더에 있음 — 전체 파일 목록 반환
      const result = await nasExec(
        `find "${NAS_MEDIA}/file" -type f ! -name ".DS_Store" 2>/dev/null | sort -r | head -500`
      );
      const paths = result.stdout.split('\n').filter(Boolean).map(p => ({
        path: p.replace(`${NAS_MEDIA}/`, ''),
        name: p.split('/').pop() ?? '',
        date: p.match(/\/(\d{4}-\d{2})\//)?.[1] ?? '',
      }));
      return NextResponse.json({ files: paths, count: paths.length });
    }

    if (type === 'videos') {
      const result = await nasExec(
        `find "${NAS_MEDIA}/video" -name "*.mp4" 2>/dev/null | sort -r | head -100`
      );
      const paths = result.stdout.split('\n').filter(Boolean).map(p =>
        p.replace(`${NAS_MEDIA}/`, '')
      );
      return NextResponse.json({ paths, count: paths.length });
    }

    return NextResponse.json({ error: '알 수 없는 type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
