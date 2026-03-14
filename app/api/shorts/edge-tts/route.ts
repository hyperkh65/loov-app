import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

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
      style,
    } = await req.json() as {
      text: string; voice?: string; rate?: number; pitch?: number; style?: string;
    };

    if (!text?.trim()) return NextResponse.json({ error: '텍스트가 없습니다.' }, { status: 400 });

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // SSML로 rate/pitch/style 제어
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
      xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">
      <voice name="${voice}">
        ${style ? `<mstts:express-as style="${style}">` : ''}
        <prosody rate="${rate >= 0 ? '+' : ''}${rate}%" pitch="${pitch >= 0 ? '+' : ''}${pitch}Hz">
          ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </prosody>
        ${style ? '</mstts:express-as>' : ''}
      </voice>
    </speak>`;

    // 오디오 스트림 + 단어 타임스탬프 동시 수집
    const audioChunks: Buffer[] = [];
    const words: { word: string; start: number; end: number }[] = [];

    await new Promise<void>((resolve, reject) => {
      const { audioStream, metadataStream } = tts.toStream(ssml);

      // 단어 타임스탬프 파싱
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
          } catch { /* 파싱 실패 무시 */ }
        });
        metadataStream.on('error', (e: Error) => console.warn('metadata error:', e));
      }

      audioStream.on('data', (chunk: Buffer) => audioChunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('error', reject);
    });

    const audioBuffer = Buffer.concat(audioChunks);
    const base64 = audioBuffer.toString('base64');
    const totalDuration = words.length > 0 ? words[words.length - 1].end : 0;

    return NextResponse.json({
      audio: `data:audio/mpeg;base64,${base64}`,
      words,
      duration: totalDuration, // ms
      voice,
    });
  } catch (e) {
    console.error('edge-tts error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
