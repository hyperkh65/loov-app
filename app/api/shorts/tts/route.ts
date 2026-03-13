import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// TTSMaker 무료 공개 음성 목록
export const TTS_VOICES = [
  { id: '2054', name: '한국어 여성 1 (밝고 친근)', lang: 'ko', gender: 'f' },
  { id: '2055', name: '한국어 남성 1 (차분)', lang: 'ko', gender: 'm' },
  { id: '2056', name: '한국어 여성 2 (따뜻)', lang: 'ko', gender: 'f' },
  { id: '2057', name: '한국어 남성 2 (활기)', lang: 'ko', gender: 'm' },
  { id: '2058', name: '한국어 여성 3 (전문적)', lang: 'ko', gender: 'f' },
];

export async function GET() {
  return NextResponse.json({ voices: TTS_VOICES });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { text, voice_id = '2054', speed = 1.0 } = await req.json() as {
      text: string; voice_id?: string; speed?: number;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    const apiKey = await getSetting('TTSMAKER_API_KEY');

    // TTSMaker API (무료 플랜: 20,000자/월)
    // API 키 없이도 일부 사용 가능 (무료 토큰)
    const token = apiKey || 'ttsmaker_demo_f2a8d'; // 데모 토큰

    // Step 1: TTS 작업 생성
    const createRes = await fetch('https://api.ttsmaker.com/v1/create-tts-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        text,
        voice_id: Number(voice_id),
        audio_format: 'mp3',
        audio_speed: speed,
        audio_volume: 1,
        text_paragraph_pause_time: 0,
      }),
    });

    const createData = await createRes.json() as {
      status: string;
      data?: { order_id: string; audio_url?: string };
      message?: string;
    };

    if (createData.status !== 'success') {
      return NextResponse.json({ error: createData.message ?? 'TTS 생성 실패' }, { status: 500 });
    }

    const audioUrl = createData.data?.audio_url;
    if (!audioUrl) return NextResponse.json({ error: 'TTS 오디오 URL을 받지 못했습니다.' }, { status: 500 });

    // Step 2: 오디오 fetch 후 반환 (CORS 우회)
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return NextResponse.json({ error: '오디오 다운로드 실패' }, { status: 500 });

    const audioBuffer = await audioRes.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({ audio: `data:audio/mp3;base64,${base64}`, url: audioUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
