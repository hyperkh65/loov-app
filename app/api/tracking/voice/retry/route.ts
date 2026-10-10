import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 60;

async function getUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const { data } = await (await createClient()).auth.getUser();
  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { memoId } = await req.json();
    if (!memoId) return NextResponse.json({ error: 'memoId 필요' }, { status: 400 });

    const db = createAdminClient();
    const { data: memo, error: fetchErr } = await db
      .from('bossai_tracking_voice_memos')
      .select('id, nas_path, user_id')
      .eq('id', memoId)
      .single();
    if (fetchErr || !memo) return NextResponse.json({ error: '메모를 찾을 수 없음' }, { status: 404 });
    if (memo.user_id !== user.id) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    const nasPath: string = memo.nas_path;
    if (!nasPath || nasPath.includes('..'))
      return NextResponse.json({ error: '잘못된 경로' }, { status: 400 });

    // Read file from NAS via base64
    const result = await nasExec(
      `python3 -c "import base64,sys; sys.stdout.buffer.write(base64.b64encode(open('${nasPath}','rb').read()))"`
    );
    if (result.code !== 0) return NextResponse.json({ error: '파일 읽기 실패' }, { status: 404 });

    const buffer = Buffer.from(result.stdout.trim(), 'base64');
    const isMP4 = nasPath.endsWith('.mp4');
    const mimeType = isMP4 ? 'audio/mp4' : 'audio/webm';

    // Transcribe with Gemini 1.5 Flash
    let transcript = '(음성 변환 실패)';
    const geminiKey = process.env.GEMINI_API_KEY || await getSetting('GEMINI_API_KEY');
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 없음' }, { status: 500 });

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const response = await model.generateContent([
      { inlineData: { mimeType, data: buffer.toString('base64') } },
      '이 음성을 한국어로 정확하게 텍스트로 변환해줘. 메모 형식으로 정리해줘.',
    ]);
    transcript = response.response.text();

    // Update DB
    const { error: updateErr } = await db
      .from('bossai_tracking_voice_memos')
      .update({ transcript })
      .eq('id', memoId);
    if (updateErr) throw updateErr;

    return NextResponse.json({ transcript });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
