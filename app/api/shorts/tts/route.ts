import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// Google Cloud TTS 한국어 Neural2 음성 목록
export const TTS_VOICES = [
  { id: 'ko-KR-Neural2-A', name: '가연 (여성 · 자연스럽고 따뜻)', gender: 'f' },
  { id: 'ko-KR-Neural2-B', name: '준혁 (남성 · 차분하고 전문적)', gender: 'm' },
  { id: 'ko-KR-Neural2-C', name: '민준 (남성 · 활기차고 친근)',   gender: 'm' },
  { id: 'ko-KR-Neural2-D', name: '서연 (여성 · 밝고 에너지)',     gender: 'f' },
  { id: 'ko-KR-Wavenet-A', name: '아연 (여성 · Wavenet)',        gender: 'f' },
  { id: 'ko-KR-Wavenet-B', name: '도현 (남성 · Wavenet)',        gender: 'm' },
  { id: 'ko-KR-Wavenet-C', name: '지수 (남성 · Wavenet)',        gender: 'm' },
  { id: 'ko-KR-Wavenet-D', name: '예린 (여성 · Wavenet)',        gender: 'f' },
];

export async function GET() {
  return NextResponse.json({ voices: TTS_VOICES });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { text, voice_id = 'ko-KR-Neural2-A', speed = 1.0, pitch = 0 } = await req.json() as {
      text: string; voice_id?: string; speed?: number; pitch?: number;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    const apiKey = await getSetting('GOOGLE_TTS_API_KEY');
    if (!apiKey) {
      return NextResponse.json({
        error: 'Google TTS API 키가 없습니다. 설정 > API 키에서 GOOGLE_TTS_API_KEY를 입력하세요.\n발급: console.cloud.google.com → Text-to-Speech API 활성화 → API 키 생성'
      }, { status: 400 });
    }

    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'ko-KR', name: voice_id },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: speed,       // 0.25 ~ 4.0
            pitch: pitch,              // -20 ~ 20 semitones
            effectsProfileId: ['headphone-class-device'],
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return NextResponse.json({ error: `Google TTS 오류: ${err.error?.message ?? res.status}` }, { status: 500 });
    }

    const data = await res.json() as { audioContent: string };
    return NextResponse.json({ audio: `data:audio/mpeg;base64,${data.audioContent}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
