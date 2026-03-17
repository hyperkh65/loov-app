import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const MOVIE_DIR = '/volume1/homes/urjent/loov/movie';

// POST: 녹화 영상 청크 저장
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const filename = (form.get('filename') as string) || `rec_${Date.now()}.webm`;

    if (!file) return NextResponse.json({ error: 'file 필요' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const destPath = `${MOVIE_DIR}/${filename}`;

    // Python3로 base64 디코딩 후 저장 (바이너리 안전)
    const result = await nasExec(
      `python3 -c "import base64; open('${destPath}','wb').write(base64.b64decode('${base64}'))"`
    );

    if (result.code !== 0) throw new Error(result.stderr || '저장 실패');

    return NextResponse.json({ ok: true, filename, size: buffer.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET: 녹화 파일 목록
export async function GET() {
  try {
    const result = await nasExec(
      `ls -lt --time-style=+%s "${MOVIE_DIR}" 2>/dev/null | grep -v '^total' | head -50`
    );
    const files = result.stdout.split('\n').filter(Boolean).map(line => {
      const m = line.match(/^([d\-])[rwxst+\-]{9}[\+@\.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!m) return null;
      return { name: m[4].trim(), size: parseInt(m[2]) || 0, modTime: parseInt(m[3]) || 0 };
    }).filter(Boolean);
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE: 녹화 파일 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename || filename.includes('..') || filename.includes('/'))
      return NextResponse.json({ error: '잘못된 파일명' }, { status: 400 });
    await nasExec(`rm -f "${MOVIE_DIR}/${filename}"`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
