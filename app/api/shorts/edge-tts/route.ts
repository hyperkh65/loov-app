import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateEdgeTts } from '@/lib/edge-tts-client';

export const maxDuration = 30; // Vercel 함수 최대 실행 시간 (초)

// 한국어 Edge-TTS 음성 목록
export const EDGE_VOICES = [
  { id: 'ko-KR-SunHiNeural',     name: '선희 (여성·밝고 활기찬)',   gender: 'f', style: ['cheerful','sad','angry'] },
  { id: 'ko-KR-InJoonNeural',    name: '인준 (남성·따뜻하고 친근)', gender: 'm', style: ['cheerful','sad'] },
  { id: 'ko-KR-BongJinNeural',   name: '봉진 (남성·차분·전문적)',   gender: 'm', style: [] },
  { id: 'ko-KR-GookMinNeural',   name: '국민 (남성·젊고 활기찬)',   gender: 'm', style: [] },
  { id: 'ko-KR-HyunsuNeural',    name: '현수 (남성·내레이션)',      gender: 'm', style: [] },
  { id: 'ko-KR-JiMinNeural',     name: '지민 (여성·부드럽)',        gender: 'f', style: [] },
  { id: 'ko-KR-SeoHyeonNeural',  name: '서현 (여성·어린이)',        gender: 'f', style: [] },
  { id: 'ko-KR-YuJinNeural',     name: '유진 (여성·감성적)',        gender: 'f', style: [] },
];

export async function GET() {
  return NextResponse.json({ voices: EDGE_VOICES });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const {
      text,
      voice = 'ko-KR-SunHiNeural',
      rate = 0,    // -50 ~ +100 (%)
      pitch = 0,   // -50 ~ +50 (Hz)
    } = await req.json() as {
      text: string; voice?: string; rate?: number; pitch?: number; style?: string;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    // ponytail: NAS 자체 호스팅 edge-tts-api는 rate/pitch만 지원, style(express-as)은
    // 미지원 — 필요해지면 edge-tts-api 쪽에 SSML 옵션 추가
    const { audioBuffer, words, duration } = await generateEdgeTts({ text, voice, rate, pitch });
    const base64 = audioBuffer.toString('base64');

    return NextResponse.json({
      audio: `data:audio/mpeg;base64,${base64}`,
      words,
      duration,
      voice,
      size: audioBuffer.length,
    });
  } catch (e) {
    console.error('edge-tts error:', e);
    return NextResponse.json({ error: `Edge-TTS 오류: ${String(e)}` }, { status: 500 });
  }
}
