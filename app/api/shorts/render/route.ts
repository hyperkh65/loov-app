import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import { readFileAsBuffer } from '@/lib/nas-sftp';
import { uploadToR2 } from '@/lib/r2-storage';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const maxDuration = 300;

interface RenderScene {
  id: number;
  narration: string;
  image_url: string;
  duration: number;
  subtitle: string;
}

// ffmpeg 경로 탐색
async function findFfmpeg(): Promise<string> {
  const paths = [
    'ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/tmp/ffmpeg',
    '/volume1/@appstore/ffmpeg/bin/ffmpeg', '/var/packages/ffmpeg6/target/bin/ffmpeg',
    '/var/packages/MediaServer/target/bin/ffmpeg',
  ];
  for (const p of paths) {
    const r = await nasExec(`${p} -version 2>&1 | head -1`);
    if (r.code === 0 && r.stdout.includes('ffmpeg')) return p;
  }
  throw new Error('NAS에 FFmpeg가 없습니다. /dashboard/shorts의 환경 체크를 먼저 실행하세요.');
}

// msedge-tts로 TTS 생성 → R2 업로드 → 공개 URL 반환
async function generateTtsUrl(text: string, voice: string, rate: number): Promise<string> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
    xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">
    <voice name="${voice}">
      <prosody rate="${rate >= 0 ? '+' : ''}${rate}%">
        ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </prosody>
    </voice>
  </speak>`;

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('TTS 타임아웃')), 25000);
    const { audioStream } = tts.toStream(ssml);
    audioStream.on('data', (d: Buffer) => chunks.push(d));
    audioStream.on('end', () => { clearTimeout(timeout); resolve(); });
    audioStream.on('error', (e: Error) => { clearTimeout(timeout); reject(e); });
  });
  const buf = Buffer.concat(chunks);
  const key = `shorts-tts/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`;
  return uploadToR2(key, buf, 'audio/mpeg');
}

// 한국어 폰트 경로 탐색
async function findKoreanFont(): Promise<string | null> {
  const r = await nasExec(
    'find /usr/share/fonts /volume1 /opt/share/fonts -name "*.ttf" -o -name "*.otf" 2>/dev/null | grep -iE "nanum|gothic|korean|KR$" | head -1'
  );
  return r.stdout.trim() || null;
}

// 자막 텍스트를 drawtext-safe 문자열로 변환
function escapeDrawtext(s: string): string {
  return s.replace(/[\\':]/g, '\\$&').replace(/\n/g, ' ');
}

// Ken Burns 효과별 FFmpeg vf 문자열 생성
const KB_EFFECTS = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left', 'pan_up'] as const;

function getKenBurnsVf(sceneIndex: number, dur: number): string {
  const effect = KB_EFFECTS[sceneIndex % KB_EFFECTS.length];
  const fps = 24;
  const frames = Math.round((dur + 4) * fps); // 여유 프레임
  // prescale: 원본 이미지 → 1080x1920 center-crop → 2x upscale (zoompan 여유 공간 확보)
  const prescale = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=2160:3840';
  const zout = `s=1080x1920:fps=${fps}:d=${frames}`;

  switch (effect) {
    case 'zoom_in':
      return `${prescale},zoompan=z='min(1+0.35*on/${frames}\\,1.35)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':${zout}`;
    case 'zoom_out':
      return `${prescale},zoompan=z='max(1.35-0.35*on/${frames}\\,1.0)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':${zout}`;
    case 'pan_right':
      return `${prescale},zoompan=z=1.3:x='(iw-iw/1.3)*on/${frames}':y='(ih-ih/1.3)/2':${zout}`;
    case 'pan_left':
      return `${prescale},zoompan=z=1.3:x='(iw-iw/1.3)*(1-on/${frames})':y='(ih-ih/1.3)/2':${zout}`;
    case 'pan_up':
      return `${prescale},zoompan=z=1.3:x='(iw-iw/1.3)/2':y='(ih-ih/1.3)*on/${frames}':${zout}`;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: '로그인 필요' }), { status: 401 });
  }

  const { scenes, voice = 'ko-KR-SunHiNeural', rate = 10, title = 'Shorts', addSubtitles = true, kenBurns = true } =
    await req.json() as {
      scenes: RenderScene[];
      voice?: string;
      rate?: number;
      title?: string;
      addSubtitles?: boolean;
      kenBurns?: boolean;
    };

  if (!scenes?.length) {
    return new Response(JSON.stringify({ error: '장면 데이터가 없습니다' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)); } catch {}
      };
      const sendErr = (msg: string) => { send('error', { message: msg }); controller.close(); };

      try {
        send('progress', { step: 1, total: 5, message: 'NAS FFmpeg 확인 중...' });
        const ffmpeg = await findFfmpeg();
        const fontPath = addSubtitles ? await findKoreanFont() : null;
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const dir = `/tmp/shorts_${jobId}`;
        await nasExec(`mkdir -p ${dir}`);

        // ── Step 2: TTS 생성 ────────────────────────────────────────
        send('progress', { step: 2, total: 5, message: `TTS 생성 중... (${scenes.length}개 장면)` });
        const ttsUrls: string[] = [];
        for (let i = 0; i < scenes.length; i++) {
          const url = await generateTtsUrl(scenes[i].narration, voice, rate);
          ttsUrls.push(url);
          send('progress', { step: 2, total: 5, message: `TTS ${i + 1}/${scenes.length} 완료` });
        }

        // ── Step 3: NAS에 렌더 스크립트 작성 & 실행 ────────────────
        send('progress', { step: 3, total: 5, message: 'NAS에서 영상 합성 중...' });

        const lines: string[] = [
          `#!/bin/bash`, `set -e`, `DIR="${dir}"`,
        ];

        // 이미지 + 오디오 다운로드
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          if (s.image_url) {
            lines.push(`curl -sL --max-time 30 "${s.image_url}" -o "$DIR/img_${i}.jpg" || curl -sL --max-time 30 "${s.image_url}" -o "$DIR/img_${i}.png"`);
          }
          lines.push(`curl -sL --max-time 30 "${ttsUrls[i]}" -o "$DIR/tts_${i}.mp3"`);
        }

        // 이미지 폴백: 빈 이미지 생성
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          if (s.image_url) {
            lines.push(`[ -f "$DIR/img_${i}.jpg" ] || [ -f "$DIR/img_${i}.png" ] || ${ffmpeg} -f lavfi -i color=c=black:s=1080x1920:d=1 -frames:v 1 "$DIR/img_${i}.jpg" -y 2>/dev/null`);
          } else {
            lines.push(`${ffmpeg} -f lavfi -i color=c=0x1a1a2e:s=1080x1920:d=1 -frames:v 1 "$DIR/img_${i}.jpg" -y 2>/dev/null`);
          }
          lines.push(`IMG_${i}=$(ls "$DIR/img_${i}".{jpg,png} 2>/dev/null | head -1)`);
        }

        // 장면별 클립 생성
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          const dur = Math.max(1, s.duration);
          const subtitle = escapeDrawtext(s.subtitle || '');

          let vfStr: string;
          if (kenBurns) {
            const kbBase = getKenBurnsVf(i, dur);
            const subtitleFilter = addSubtitles && subtitle
              ? fontPath
                ? `,drawtext=fontfile='${fontPath}':text='${subtitle}':fontsize=58:fontcolor=white:x=(w-text_w)/2:y=h-200:shadowcolor=black@0.9:shadowx=4:shadowy=4:box=1:boxcolor=black@0.65:boxborderw=22`
                : `,drawtext=text='${subtitle}':fontsize=52:fontcolor=white:x=(w-text_w)/2:y=h-200:shadowcolor=black@0.9:shadowx=4:shadowy=4`
              : '';
            vfStr = kbBase + subtitleFilter;
          } else {
            const vfParts = [
              'scale=1080:1920:force_original_aspect_ratio=increase',
              'crop=1080:1920',
            ];
            if (addSubtitles && subtitle && fontPath) {
              vfParts.push(
                `drawtext=fontfile='${fontPath}':text='${subtitle}':fontsize=52:fontcolor=white:` +
                `x=(w-text_w)/2:y=h-220:shadowcolor=black@0.8:shadowx=3:shadowy=3:` +
                `box=1:boxcolor=black@0.55:boxborderw=18`
              );
            } else if (addSubtitles && subtitle) {
              vfParts.push(
                `drawtext=text='${subtitle}':fontsize=46:fontcolor=white:` +
                `x=(w-text_w)/2:y=h-220:shadowcolor=black@0.9:shadowx=3:shadowy=3`
              );
            }
            vfStr = vfParts.join(',');
          }

          lines.push(
            `${ffmpeg} -loop 1 -i "$IMG_${i}" -i "$DIR/tts_${i}.mp3" ` +
            `-vf "${vfStr}" ` +
            `-c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 128k -shortest -y "$DIR/scene_${i}.mp4" 2>/dev/null`
          );
        }

        // filelist.txt 생성
        const filelistLines = scenes.map((_, i) => `file '${dir}/scene_${i}.mp4'`);
        lines.push(`printf '${filelistLines.join('\\n')}\\n' > "$DIR/filelist.txt"`);

        // 최종 합치기
        lines.push(
          `${ffmpeg} -f concat -safe 0 -i "$DIR/filelist.txt" ` +
          `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 128k -movflags +faststart -y "$DIR/final.mp4" 2>/dev/null`
        );
        lines.push(`echo "RENDER_DONE"`);

        const script = lines.join('\n');
        await nasExecWithStdin(`cat > ${dir}/render.sh`, script);

        const renderResult = await nasExec(`bash ${dir}/render.sh`);
        if (!renderResult.stdout.includes('RENDER_DONE')) {
          throw new Error('렌더링 실패: ' + (renderResult.stderr || renderResult.stdout).slice(0, 300));
        }

        // ── Step 4: NAS에서 MP4 읽어서 R2에 업로드 ────────────────
        send('progress', { step: 4, total: 5, message: 'R2에 업로드 중...' });
        const mp4Buffer = await readFileAsBuffer(`${dir}/final.mp4`);

        if (!mp4Buffer || mp4Buffer.length < 1000) {
          throw new Error('렌더링된 파일이 비어있습니다');
        }

        const safeTitle = title.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 30);
        const r2Key = `shorts-videos/${Date.now()}_${safeTitle}.mp4`;
        const videoUrl = await uploadToR2(r2Key, mp4Buffer, 'video/mp4');

        // NAS 임시파일 정리
        await nasExec(`rm -rf ${dir}`).catch(() => {});

        // ── Step 5: 완료 ────────────────────────────────────────────
        send('progress', { step: 5, total: 5, message: '완료!' });
        send('done', {
          url: videoUrl,
          size: mp4Buffer.length,
          scenes: scenes.length,
        });
      } catch (e) {
        sendErr(e instanceof Error ? e.message : String(e));
        return;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
