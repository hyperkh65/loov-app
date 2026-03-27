import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

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

    // Determine xml:lang attribute
    const langMap: Record<string, string> = {
      en: 'en-US', zh: 'zh-CN', ja: 'ja-JP',
      fr: 'fr-FR', es: 'es-ES', de: 'de-DE',
      vi: 'vi-VN', th: 'th-TH', ko: 'ko-KR',
    };
    const xmlLang = langMap[language] || 'en-US';

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
      xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${xmlLang}">
      <voice name="${voice}">
        <prosody rate="+0%" pitch="+0Hz">
          ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </prosody>
      </voice>
    </speak>`;

    const audioChunks: Buffer[] = [];
    const words: { word: string; start: number; end: number }[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('TTS 타임아웃 (25초)')), 25000);

      const { audioStream, metadataStream } = tts.toStream(ssml);

      if (metadataStream) {
        metadataStream.on('data', (data: Buffer) => {
          try {
            const parsed = JSON.parse(data.toString()) as {
              Metadata?: Array<{
                Type: string;
                Data: { text: { Text: string }; Offset: number; Duration: number };
              }>;
            };
            for (const item of parsed.Metadata ?? []) {
              if (item.Type === 'WordBoundary') {
                words.push({
                  word: item.Data.text.Text,
                  start: Math.round(item.Data.Offset / 10000),
                  end: Math.round((item.Data.Offset + item.Data.Duration) / 10000),
                });
              }
            }
          } catch { /* ignore parse errors */ }
        });
        metadataStream.on('error', (e: Error) => console.warn('metadata error:', e));
      }

      audioStream.on('data', (chunk: Buffer) => audioChunks.push(chunk));
      audioStream.on('end', () => { clearTimeout(timeout); resolve(); });
      audioStream.on('error', (e: Error) => { clearTimeout(timeout); reject(e); });
    });

    const audioBuffer = Buffer.concat(audioChunks);

    if (audioBuffer.length === 0) {
      return NextResponse.json(
        { error: 'TTS: 오디오 데이터가 비어 있습니다' },
        { status: 500 }
      );
    }

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
