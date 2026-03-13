import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// Azure Neural TTS 한국어 음성 목록
export const TTS_VOICES = [
  { id: 'ko-KR-SunHiNeural',      name: '선희 (여성 · 밝고 친근)',   lang: 'ko', gender: 'f' },
  { id: 'ko-KR-InJoonNeural',     name: '인준 (남성 · 차분)',        lang: 'ko', gender: 'm' },
  { id: 'ko-KR-JiMinNeural',      name: '지민 (여성 · 활기)',        lang: 'ko', gender: 'f' },
  { id: 'ko-KR-BongJinNeural',    name: '봉진 (남성 · 깊고 안정)',   lang: 'ko', gender: 'm' },
  { id: 'ko-KR-GookMinNeural',    name: '국민 (남성 · 친근)',        lang: 'ko', gender: 'm' },
  { id: 'ko-KR-HyunsuNeural',     name: '현수 (남성 · 젊고 에너지)', lang: 'ko', gender: 'm' },
  { id: 'ko-KR-SeoHyeonNeural',   name: '서현 (여성 · 전문적)',      lang: 'ko', gender: 'f' },
  { id: 'ko-KR-YuJinNeural',      name: '유진 (여성 · 따뜻)',        lang: 'ko', gender: 'f' },
];

export async function GET() {
  return NextResponse.json({ voices: TTS_VOICES });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { text, voice_id = 'ko-KR-SunHiNeural', speed = 1.0, pitch = 1.0 } = await req.json() as {
      text: string; voice_id?: string; speed?: number; pitch?: number;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    const apiKey = await getSetting('AZURE_TTS_KEY');
    const region  = (await getSetting('AZURE_TTS_REGION')) || 'koreacentral';

    if (!apiKey) {
      return NextResponse.json({ error: 'Azure TTS API 키가 설정되지 않았습니다. 설정 > API 키에서 AZURE_TTS_KEY를 입력하세요.' }, { status: 400 });
    }

    // 속도/음높이 → SSML prosody 형식 변환
    const ratePercent  = Math.round((speed - 1.0) * 100);
    const pitchPercent = Math.round((pitch - 1.0) * 100);
    const rateStr  = ratePercent  >= 0 ? `+${ratePercent}%`  : `${ratePercent}%`;
    const pitchStr = pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`;

    const ssml = `<speak version='1.0' xml:lang='ko-KR'>
  <voice name='${voice_id}'>
    <prosody rate='${rateStr}' pitch='${pitchStr}'>
      ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </prosody>
  </voice>
</speak>`;

    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'loov-app',
      },
      body: ssml,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Azure TTS 오류 (${res.status}): ${errText}` }, { status: 500 });
    }

    const audioBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({ audio: `data:audio/mp3;base64,${base64}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
