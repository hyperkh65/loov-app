import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { nasExecWithStdin, nasExec } from '@/lib/nas-ssh';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 60;

const VOICE_DIR = '/volume1/homes/urjent/loov/voice';

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file 필요' }, { status: 400 });

    const lat = form.get('lat') ? parseFloat(form.get('lat') as string) : null;
    const lng = form.get('lng') ? parseFloat(form.get('lng') as string) : null;
    const sessionId = (form.get('sessionId') as string) || null;
    const duration = form.get('duration') ? parseInt(form.get('duration') as string) : null;

    const kst = new Date(Date.now() + 9 * 3600_000);
    const ts = kst.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const fileExt = file.name.endsWith('.mp4') ? 'mp4' : 'webm';
    const fileMimeType = file.type || (fileExt === 'mp4' ? 'audio/mp4' : 'audio/webm');
    const filename = `${ts}.${fileExt}`;
    const nasPath = `${VOICE_DIR}/${filename}`;

    await nasExec(`mkdir -p ${VOICE_DIR}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const saveResult = await nasExecWithStdin(
      `python3 -c "import sys; open('${nasPath}','wb').write(sys.stdin.buffer.read())"`,
      buffer
    );
    if (saveResult.code !== 0) throw new Error(`NAS 저장 실패: ${saveResult.stderr}`);

    let transcript = '';
    let aiProvider = 'gemini';
    try {
      const geminiKey = process.env.GEMINI_API_KEY || await getSetting('GEMINI_API_KEY');
      if (geminiKey) {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent([
          { inlineData: { mimeType: fileMimeType, data: buffer.toString('base64') } },
          '이 음성을 한국어로 정확하게 텍스트로 변환해줘. 메모 형식으로 정리해줘.',
        ]);
        transcript = result.response.text();
      }
    } catch (err) {
      console.error('Transcription error:', err);
      transcript = '(음성 변환 실패)';
    }

    const db = createAdminClient();
    const { data: memo, error: dbErr } = await db
      .from('bossai_tracking_voice_memos')
      .insert({ user_id: user.id, nas_path: nasPath, transcript, lat, lng, duration_sec: duration, ai_provider: aiProvider, session_id: sessionId })
      .select()
      .single();
    if (dbErr) throw dbErr;

    return NextResponse.json({ id: memo.id, transcript, nas_path: nasPath });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    let dateStr = searchParams.get('date');
    if (!dateStr) {
      const kst = new Date(Date.now() + 9 * 3600_000);
      dateStr = kst.toISOString().slice(0, 10);
    }

    const startUTC = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
    const endUTC = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

    const db = createAdminClient();
    const { data: memos, error } = await db
      .from('bossai_tracking_voice_memos')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', startUTC)
      .lte('created_at', endUTC)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ memos: memos ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
