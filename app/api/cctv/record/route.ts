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

// GET: 녹화 파일 목록 (python3 사용 — busybox find -printf 미지원 대응)
export async function GET() {
  try {
    const result = await nasExec(
      `python3 -c "
import os, json
d = '${MOVIE_DIR}'
exts = ('.webm', '.mp4', '.mkv')
files = []
for f in os.listdir(d):
    if not f.endswith(exts): continue
    p = os.path.join(d, f)
    try:
        st = os.stat(p)
        files.append({'name': f, 'size': st.st_size, 'modTime': int(st.st_mtime)})
    except: pass
files.sort(key=lambda x: -x['modTime'])
print(json.dumps(files[:200]))
"`
    );
    const files = JSON.parse(result.stdout.trim() || '[]');
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
