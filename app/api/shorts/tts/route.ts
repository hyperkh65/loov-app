import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const TTS_VOICES = [
  { id: 'ko-KR-SunHiNeural',    name: '선희 · 여성 · 밝고 친근',   gender: 'f' },
  { id: 'ko-KR-InJoonNeural',   name: '인준 · 남성 · 따뜻하고 친근', gender: 'm' },
  { id: 'ko-KR-JiMinNeural',    name: '지민 · 여성 · 부드럽',      gender: 'f' },
  { id: 'ko-KR-BongJinNeural',  name: '봉진 · 남성 · 차분·전문적',  gender: 'm' },
  { id: 'ko-KR-GookMinNeural',  name: '국민 · 남성 · 젊고 활기찬',  gender: 'm' },
  { id: 'ko-KR-HyunsuNeural',   name: '현수 · 남성 · 내레이션',    gender: 'm' },
  { id: 'ko-KR-SeoHyeonNeural', name: '서현 · 여성 · 어린이',      gender: 'f' },
  { id: 'ko-KR-YuJinNeural',    name: '유진 · 여성 · 감성적',      gender: 'f' },
];

export async function GET() {
  return NextResponse.json({ voices: TTS_VOICES });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { text, voice_id = 'ko-KR-SunHiNeural', speed = 1.0 } = await req.json() as {
      text: string; voice_id?: string; speed?: number;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    // 시놀로지 NAS Edge-TTS 서버 URL (설정에서 지정)
    const nasUrl = (await getSetting('EDGE_TTS_SERVER_URL')) || 'http://aboda.kr:5050';

    const secret = (await getSetting('EDGE_TTS_SECRET')) || 'loov_tts_secret';
    const ratePercent = Math.round((speed - 1.0) * 100);

    const res = await fetch(`${nasUrl.replace(/\/$/, '')}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-API-Secret': secret } : {}),
      },
      body: JSON.stringify({ text, voice: voice_id, rate: ratePercent }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `NAS TTS 오류: ${err}` }, { status: 500 });
    }

    const data = await res.json() as { audio?: string; words?: unknown[]; duration?: number; error?: string };
    if (data.error) return NextResponse.json({ error: data.error }, { status: 500 });

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `TTS 연결 실패: ${String(e)}` }, { status: 500 });
  }
}
