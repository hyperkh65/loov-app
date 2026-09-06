import { NextRequest, NextResponse } from 'next/server';
import { generateEdgeTts } from '@/lib/edge-tts-client';

export const maxDuration = 30;

const LANG_VOICES: Record<string, { female: string; male: string }> = {
  en: { female: 'en-US-AriaNeural',       male: 'en-US-GuyNeural' },
  zh: { female: 'zh-CN-XiaoxiaoNeural',   male: 'zh-CN-YunxiNeural' },
  ja: { female: 'ja-JP-NanamiNeural',     male: 'ja-JP-KeitaNeural' },
  fr: { female: 'fr-FR-DeniseNeural',     male: 'fr-FR-HenriNeural' },
  es: { female: 'es-ES-ElviraNeural',     male: 'es-ES-AlvaroNeural' },
  de: { female: 'de-DE-KatjaNeural',      male: 'de-DE-ConradNeural' },
  vi: { female: 'vi-VN-HoaiMyNeural',     male: 'vi-VN-NamMinhNeural' },
  th: { female: 'th-TH-PremwadeeNeural',  male: 'th-TH-NiwatNeural' },
  ko: { female: 'ko-KR-SunHiNeural',      male: 'ko-KR-InJoonNeural' },
};

export async function POST(req: NextRequest) {
  try {
    const { text, language = 'en', gender = 'female' } = await req.json() as {
      text: string;
      language?: string;
      gender?: 'female' | 'male';
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: '텍스트가 없습니다' }, { status: 400 });
    }

    const voices = LANG_VOICES[language] || LANG_VOICES['en'];
    const voice = gender === 'male' ? voices.male : voices.female;

    const { audioBuffer, words } = await generateEdgeTts({ text, voice });
    const base64 = audioBuffer.toString('base64');

    return NextResponse.json({
      audio: `data:audio/mpeg;base64,${base64}`,
      words,
      voice,
    });
  } catch (error) {
    console.error('Language TTS error:', error);
    return NextResponse.json({ error: `TTS 오류: ${String(error)}` }, { status: 500 });
  }
}
