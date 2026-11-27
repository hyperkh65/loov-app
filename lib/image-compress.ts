// 웹용 사진 줄이기 — R2에 올리는 모든 사진이 uploadToR2에서 이 함수를 거친다(2026-11-27).
// 원본 PNG가 장당 2MB라 첫 방문자가 사진마다 1~2초 기다렸다. 300KB 넘는 사진은 가로 최대 1600px·JPEG(품질 82)로 바꾸고,
// 더 작아질 때만 바꾼 것을 쓴다. GIF·작은 그림은 그대로.
import sharp from 'sharp';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function compressForWeb(buf: Buffer, type: string): Promise<{ buf: Buffer; type: string; ext: string }> {
  const ext = EXT[type] || 'bin';
  if (!/^image\/(png|jpe?g|webp)$/i.test(type) || buf.length <= 300_000) return { buf, type, ext };
  try {
    const out = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: 1600, withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return out.length < buf.length ? { buf: out, type: 'image/jpeg', ext: 'jpg' } : { buf, type, ext };
  } catch { return { buf, type, ext }; }
}
