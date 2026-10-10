import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

export const maxDuration = 30;

async function getUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const { data } = await (await createClient()).auth.getUser();
  return data.user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const nasPath = searchParams.get('path');
    if (!nasPath || nasPath.includes('..'))
      return NextResponse.json({ error: '잘못된 경로' }, { status: 400 });

    // Read file from NAS via base64
    const result = await nasExec(
      `python3 -c "import base64,sys; sys.stdout.buffer.write(base64.b64encode(open('${nasPath}','rb').read()))"`
    );
    if (result.code !== 0) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

    const buffer = Buffer.from(result.stdout.trim(), 'base64');
    const isMP4 = nasPath.endsWith('.mp4');
    const contentType = isMP4 ? 'audio/mp4' : 'audio/webm';
    const fileExt = isMP4 ? 'mp4' : 'webm';

    const download = searchParams.get('download');
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };
    if (download === '1') {
      const timestamp = nasPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? Date.now().toString();
      headers['Content-Disposition'] = `attachment; filename="voice-memo-${timestamp}.${fileExt}"`;
    }

    return new NextResponse(buffer, { headers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
