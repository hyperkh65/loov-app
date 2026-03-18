import { NextRequest, NextResponse } from 'next/server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import { checkAndArchive } from '@/app/api/cctv/storage/route';

export const maxDuration = 60; // Vercel 함수 최대 60초 (기본 10초로는 대용량 파일 전송 실패 가능)

const MOVIE_DIR = '/volume1/homes/urjent/loov/movie';

// POST: 녹화 영상 청크 저장 (stdin pipe 방식 — shell 인수 길이 제한 없음)
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const filename = (form.get('filename') as string) || `rec_${Date.now()}.webm`;

    if (!file) return NextResponse.json({ error: 'file 필요' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const destPath = `${MOVIE_DIR}/${filename}`;

    // 바이너리를 stdin으로 pipe → python3가 직접 파일 저장
    const result = await nasExecWithStdin(
      `python3 -c "import sys; open('${destPath}','wb').write(sys.stdin.buffer.read())"`,
      buffer
    );

    if (result.code !== 0) throw new Error(result.stderr || '저장 실패');

    // 업로드 성공 응답을 먼저 보내고, 백그라운드에서 스토리지 체크
    checkAndArchive().catch(console.error); // await 없이 fire-and-forget
    return NextResponse.json({ ok: true, filename, size: buffer.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET: 녹화 파일 목록
export async function GET() {
  try {
    // stat 방식: 파일명에 공백이 있어도 안전하게 파싱
    const result = await nasExec(
      `find "${MOVIE_DIR}" -maxdepth 1 -type f \\( -name "*.webm" -o -name "*.mp4" -o -name "*.mkv" \\) -printf "%f\\t%s\\t%T@\\n" 2>/dev/null | sort -t$'\\t' -k3 -rn | head -100`
    );
    const files = result.stdout.split('\n').filter(Boolean).map(line => {
      const parts = line.split('\t');
      if (parts.length < 3) return null;
      return { name: parts[0].trim(), size: parseInt(parts[1]) || 0, modTime: Math.floor(parseFloat(parts[2])) || 0 };
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
