/**
 * NAS에 자체 호스팅된 edge-tts-api(Python edge_tts 래퍼, /volume1/docker/edge-tts-api)
 * 호출 클라이언트. npm msedge-tts@2.0.4~2.0.7 전부가 마이크로소프트 쪽 변경으로
 * 오디오 0바이트/연결 끊김을 내는 게 확인돼(로컬+NAS 양쪽 재현), 이 서비스로 교체.
 * loov-app과 같은 NAS 기본 브리지 네트워크에 떠 있어 게이트웨이 IP로 접근.
 */
const EDGE_TTS_API_URL = process.env.EDGE_TTS_API_URL || 'http://172.17.0.1:5050';
const EDGE_TTS_API_SECRET = process.env.EDGE_TTS_API_SECRET || 'loov_tts_secret';

export interface TtsWord { word: string; start: number; end: number }
export interface TtsResult { audioBuffer: Buffer; words: TtsWord[]; duration: number }

export async function generateEdgeTts(params: {
  text: string; voice: string; rate?: number; pitch?: number;
}): Promise<TtsResult> {
  const { text, voice, rate = 0, pitch = 0 } = params;

  const res = await fetch(`${EDGE_TTS_API_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Secret': EDGE_TTS_API_SECRET },
    body: JSON.stringify({ text, voice, rate, pitch }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`edge-tts-api 실패(${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const data = await res.json() as { audio: string; words?: TtsWord[]; duration?: number };
  const base64 = data.audio?.split(',')[1] || '';
  const audioBuffer = Buffer.from(base64, 'base64');
  if (audioBuffer.length === 0) {
    throw new Error('edge-tts-api: 오디오 데이터가 비어 있습니다');
  }

  return { audioBuffer, words: data.words || [], duration: data.duration || 0 };
}
