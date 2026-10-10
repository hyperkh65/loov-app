import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const SUPERTONIC_VOICES = [
  { id: 'F1', name: 'F1 · 여성 · 차분',    gender: 'f' },
  { id: 'F2', name: 'F2 · 여성 · 밝음',    gender: 'f' },
  { id: 'F3', name: 'F3 · 여성 · 감성적',  gender: 'f' },
  { id: 'F4', name: 'F4 · 여성 · 전문적',  gender: 'f' },
  { id: 'F5', name: 'F5 · 여성 · 활기찬',  gender: 'f' },
  { id: 'M1', name: 'M1 · 남성 · 차분',    gender: 'm' },
  { id: 'M2', name: 'M2 · 남성 · 밝음',    gender: 'm' },
  { id: 'M3', name: 'M3 · 남성 · 내레이션', gender: 'm' },
  { id: 'M4', name: 'M4 · 남성 · 전문적',  gender: 'm' },
  { id: 'M5', name: 'M5 · 남성 · 활기찬',  gender: 'm' },
];

export async function GET() {
  return NextResponse.json({ voices: SUPERTONIC_VOICES });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { text, voice_id = 'F3', speed = 1.05, lang = 'ko' } = await req.json() as {
      text: string; voice_id?: string; speed?: number; lang?: string;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    const nasUrl = (await getSetting('SUPERTONIC_SERVER_URL')) || 'http://aboda.kr:5051';
    const secret = (await getSetting('SUPERTONIC_SECRET')) || 'loov_tts_secret';

    const res = await fetch(`${nasUrl.replace(/\/$/, '')}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-API-Secret': secret } : {}),
      },
      body: JSON.stringify({ text, voice: voice_id, speed, lang }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Supertonic TTS 오류: ${err}` }, { status: 500 });
    }

    const data = await res.json() as { audio?: string; duration?: number; error?: string };
    if (data.error) return NextResponse.json({ error: data.error }, { status: 500 });

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Supertonic 연결 실패: ${String(e)}` }, { status: 500 });
  }
}
