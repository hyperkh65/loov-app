import { NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { uploadToR2 } from '@/lib/r2-storage';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import { readFileAsBuffer } from '@/lib/nas-sftp';
import { callAI } from '@/lib/ai-call';

export const maxDuration = 300;

// ── 타입 ────────────────────────────────────────────────────────────────────
interface Scene {
  id: number;
  duration: number;
  narration: string;
  subtitle: string;
  image_query: string;
  image_url: string;
}

// ── FFmpeg 경로 ──────────────────────────────────────────────────────────────
async function findFfmpeg(): Promise<string> {
  // libx264 지원 바이너리 우선
  const paths = [
    '/volume1/homes/urjent/bin/ffmpeg',
    '/var/packages/ffmpeg6/target/bin/ffmpeg',
    '/volume1/@appstore/ffmpeg/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/tmp/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ];
  for (const p of paths) {
    const r = await nasExec(`${p} -version 2>&1 | head -1`);
    if (r.code === 0 && r.stdout.includes('ffmpeg')) return p;
  }
  throw new Error('NAS FFmpeg 없음');
}


// ── Pixabay 이미지 검색 ──────────────────────────────────────────────────────
async function pixabaySearch(query: string, apiKey: string): Promise<string | null> {
  const hasKorean = /[가-힣]/.test(query);
  try {
    const q = encodeURIComponent(query);
    const langParam = hasKorean ? '&lang=ko' : '';
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${q}${langParam}&image_type=photo&per_page=10&safesearch=true`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { hits?: Array<{ largeImageURL: string; imageWidth: number; imageHeight: number }> };
    const hits = d.hits ?? [];
    if (!hits.length) return null;
    // 세로 비율(9:16)에 가까운 이미지 우선
    const sorted = [...hits].sort((a, b) =>
      Math.abs(a.imageHeight / a.imageWidth - 16 / 9) - Math.abs(b.imageHeight / b.imageWidth - 16 / 9)
    );
    return sorted[0].largeImageURL;
  } catch {
    return null;
  }
}

// ── assignImages: 블로그 이미지 → 핵심 씬, 나머지 → Pixabay ─────────────────
function getKeyIndices(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  if (count === 1) return [0];
  const indices = new Set<number>([0, total - 1]);
  for (let i = 1; i < count - 1; i++) {
    indices.add(Math.round(i * (total - 1) / (count - 1)));
  }
  return [...indices].sort((a, b) => a - b).slice(0, count);
}

// ── Ken Burns FFmpeg vf ──────────────────────────────────────────────────────
const KB_EFFECTS = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left', 'pan_up'] as const;

function getKenBurnsVf(sceneIdx: number, dur: number): string {
  const effect = KB_EFFECTS[sceneIdx % KB_EFFECTS.length];
  const fps = 24;
  const frames = (dur + 4) * fps;
  const pre = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=2160:3840';
  const zout = `s=1080x1920:fps=${fps}:d=${frames}`;
  switch (effect) {
    case 'zoom_in':   return `${pre},zoompan=z='min(1+0.35*on/${frames}\\,1.35)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':${zout}`;
    case 'zoom_out':  return `${pre},zoompan=z='max(1.35-0.35*on/${frames}\\,1.0)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':${zout}`;
    case 'pan_right': return `${pre},zoompan=z=1.3:x='(iw-iw/1.3)*on/${frames}':y='(ih-ih/1.3)/2':${zout}`;
    case 'pan_left':  return `${pre},zoompan=z=1.3:x='(iw-iw/1.3)*(1-on/${frames})':y='(ih-ih/1.3)/2':${zout}`;
    case 'pan_up':    return `${pre},zoompan=z=1.3:x='(iw-iw/1.3)/2':y='(ih-ih/1.3)*on/${frames}':${zout}`;
  }
}

const KO_FONT_DIR = '/volume1/homes/urjent/bin/fonts';
const KO_FONT_PATH = `${KO_FONT_DIR}/NanumGothicBold.ttf`;

// ── ASS 자막 파일 생성 ────────────────────────────────────────────────────────
function makeAssSubtitle(subtitle: string, durationSec: number): string {
  const text = subtitle.replace(/[{}\\]/g, '').trim().slice(0, 30);
  if (!text) return '';
  const end = durationSec + 5;
  const h = Math.floor(end / 3600);
  const m = Math.floor((end % 3600) / 60);
  const s = Math.floor(end % 60);
  const endTime = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.00`;
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,NanumGothicBold,72,&H00FFFFFF,&H000000FF,&H00000000,&HCC000000,1,0,0,0,100,100,0,0,1,4,2,2,60,60,80,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,${endTime},Default,,0,0,0,,${text}`,
  ].join('\n');
}

// ── YouTube 업로드 ────────────────────────────────────────────────────────────
async function ytUpload(
  userId: string,
  videoBuffer: ArrayBuffer,
  title: string,
  description: string,
  keyword: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: conn } = await admin.from('sns_connections')
    .select('access_token, refresh_token, extra')
    .eq('user_id', userId).eq('platform', 'youtube').eq('is_active', true).single();
  if (!conn) return null;

  let accessToken = conn.access_token;
  const expiresAt = conn.extra?.expires_at ? new Date(conn.extra.expires_at) : null;
  if (expiresAt && expiresAt <= new Date() && conn.refresh_token) {
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: conn.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });
    const td = await tr.json() as { access_token?: string };
    if (td.access_token) {
      accessToken = td.access_token;
      await admin.from('sns_connections').update({
        access_token: accessToken,
        extra: { expires_at: new Date(Date.now() + 3600000).toISOString() },
      }).eq('user_id', userId).eq('platform', 'youtube');
    }
  }

  const ytTitle = `${title} #Shorts`.slice(0, 100);
  const ytDesc = `${description}\n\n#Shorts #쇼츠${keyword ? ` #${keyword}` : ''}`.slice(0, 5000);
  const tags = ['Shorts', '쇼츠', ...(keyword ? [keyword] : [])].slice(0, 30);

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: { title: ytTitle, description: ytDesc, tags, categoryId: '22' },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      }),
    }
  );
  if (!initRes.ok) return null;

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) return null;

  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: videoBuffer,
  });
  if (!upRes.ok) return null;

  const d = await upRes.json() as { id?: string };
  return d.id ? `https://www.youtube.com/shorts/${d.id}` : null;
}

// ── SSE 핸들러 ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json() as {
    article_id?: string;
    title: string;
    keyword?: string;
    description?: string;
    content?: string;
    blog_url?: string;         // 발행된 블로그 URL (이미지 추출용)
    voice?: string;
    tts_rate?: string;
    duration?: number;
  };

  if (!body.title) return new Response('title 필요', { status: 400 });

  const admin = createAdminClient();
  const { data: job } = await admin.from('bossai_shorts_queue').insert({
    user_id: user.id,
    article_id: body.article_id,
    title: body.title,
    keyword: body.keyword ?? '',
    status: 'pending',
    progress: '대기 중...',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id').single();
  if (!job) return new Response('DB 저장 실패', { status: 500 });

  const jobId = job.id;
  const userId = user.id;
  const voice = body.voice ?? 'ko-KR-SunHiNeural';
  const ttsRate = body.tts_rate ?? '+35%';
  const duration = body.duration ?? 60;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const cookieHeader = req.headers.get('cookie') || '';

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* 연결 끊김 */ }
      };
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { /* 연결 끊김 */ }
      }, 20000);

      const upd = async (progress: string, extra?: Record<string, unknown>) => {
        send({ type: 'progress', msg: progress, ...extra });
        await admin.from('bossai_shorts_queue')
          .update({ progress, status: 'running', updated_at: new Date().toISOString(), ...extra })
          .eq('id', jobId);
      };

      try {
        // ── 1. Supabase 설정 (Pixabay 키) ────────────────────────────
        const { data: appSettings } = await admin.from('app_settings').select('settings').eq('id', 1).single();
        const settings = (appSettings?.settings ?? {}) as Record<string, string>;
        const pixabayKey = settings.PIXABAY_API_KEY ?? '';

        // ── 2. 블로그 이미지 가져오기 ────────────────────────────────
        await upd('블로그 이미지 분석 중...', { pct: 5 });
        let blogImages: string[] = [];
        if (body.blog_url) {
          try {
            const imgRes = await fetch(
              `${baseUrl}/api/shorts/blog?url=${encodeURIComponent(body.blog_url)}&get_images=1`,
              { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(15000) }
            );
            if (imgRes.ok) {
              const imgData = await imgRes.json() as { images?: string[] };
              blogImages = imgData.images ?? [];
            }
          } catch { /* 이미지 없어도 계속 */ }
        }
        send({ type: 'progress', msg: `블로그 이미지 ${blogImages.length}장 확보`, pct: 8 });

        // ── 3. AI 스크립트 생성 (블로그 내용 기반) ───────────────────
        await upd('AI 스크립트 생성 중...', { pct: 10 });
        const topic = [
          body.title,
          body.keyword ? `키워드: ${body.keyword}` : '',
          body.description || body.content?.slice(0, 800) || '',
        ].filter(Boolean).join('\n\n');

        const result = await callAI({
          messages: [
            {
              role: 'system',
              content: '당신은 대한민국 최고의 숏폼 바이럴 콘텐츠 크리에이터입니다. 시청자가 첫 3초에 멈추고, 끝까지 보고, 공유하게 만드는 스크립트를 씁니다. 반드시 유효한 JSON만 출력하며, 코드블록이나 추가 설명은 절대 포함하지 않습니다.',
            },
            {
              role: 'user',
              content: await buildShortsPrompt(topic, duration),
            },
          ],
          useFallback: true,
          maxTokens: 4000,
          temperature: 0.85,
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('스크립트 JSON 파싱 실패');
        const genData = JSON.parse(jsonMatch[0]) as {
          title?: string; description?: string; hook?: string; scenes?: Scene[];
        };
        if (!genData.scenes?.length) throw new Error('씬 데이터 없음');

        const scenes = genData.scenes;
        send({ type: 'progress', msg: `스크립트 완성 (${scenes.length}개 씬)`, pct: 20 });

        // ── 4. 이미지 배치 (assignImages 로직) ───────────────────────
        await upd('이미지 배치 결정 중...', { pct: 22 });
        const N = scenes.length;
        const B = blogImages.length;
        const keyIndices = getKeyIndices(N, B);

        // 각 씬에 이미지 URL 배정
        for (let i = 0; i < scenes.length; i++) {
          const blogPos = keyIndices.indexOf(i);
          if (blogPos >= 0) {
            scenes[i].image_url = blogImages[blogPos];
          }
          // image_url 없는 씬은 Pixabay 검색으로 채움
        }

        // Pixabay로 빈 씬 채우기
        await upd('Pixabay 이미지 검색 중...', { pct: 25 });
        for (let i = 0; i < scenes.length; i++) {
          if (scenes[i].image_url) continue;
          const url = pixabayKey ? await pixabaySearch(scenes[i].image_query, pixabayKey) : null;
          if (url) {
            scenes[i].image_url = url;
          }
          send({ type: 'progress', msg: `이미지 검색 중... (${i + 1}/${N})`, pct: 25 + Math.round((i / N) * 10) });
        }

        // ── 5. NAS 렌더링 준비 ────────────────────────────────────────
        await upd('NAS 렌더 환경 확인 중...', { pct: 36 });
        const ffmpeg = await findFfmpeg();
        const jobDir = `/tmp/shorts_auto_${jobId.replace(/-/g, '').slice(0, 12)}`;
        await nasExec(`mkdir -p ${jobDir}`);

        // ── 6. TTS 나레이션 + ASS 자막 NAS 전송 (SSH) ───────────────────
        await upd('TTS·자막 파일 NAS 전송 중...', { pct: 38 });
        for (let i = 0; i < scenes.length; i++) {
          send({ type: 'progress', msg: `파일 전송 ${i + 1}/${scenes.length}`, pct: 38 + Math.round((i / scenes.length) * 14) });
          await nasExecWithStdin(`cat > ${jobDir}/narration_${i}.txt`, scenes[i].narration);
          const assContent = makeAssSubtitle(scenes[i].subtitle || '', Math.max(1, scenes[i].duration));
          if (assContent) await nasExecWithStdin(`cat > ${jobDir}/sub_${i}.ass`, assContent);
        }

        // ── 7. 렌더 스크립트 생성 & 실행 ─────────────────────────────
        await upd('NAS FFmpeg 렌더링 중... (~2분)', { pct: 54 });

        const EDGE_TTS = '/var/services/homes/urjent/.local/bin/edge-tts';
        const TTS_FALLBACKS = ['ko-KR-InJoonNeural', 'ko-KR-HyunsuNeural', 'ko-KR-SunHiNeural'].filter(v => v !== voice);
        const lines: string[] = ['#!/bin/bash', 'set -e', `DIR="${jobDir}"`, `LOG="$DIR/render.log"`];

        // NAS edge-tts로 TTS 생성 (먼저 실행해 빠른 실패 감지)
        for (let i = 0; i < scenes.length; i++) {
          const voiceCmds = [voice, ...TTS_FALLBACKS]
            .map(v => `${EDGE_TTS} --voice ${v} --rate "${ttsRate}" --file "$DIR/narration_${i}.txt" --write-media "$DIR/tts_${i}.mp3" 2>>"$LOG"`)
            .join(' || ');
          lines.push(`echo "TTS_${i}_START" >> "$LOG"`);
          lines.push(`${voiceCmds} || { echo "TTS_FAIL_${i}" >> "$LOG"; exit 1; }`);
          lines.push(`[ -s "$DIR/tts_${i}.mp3" ] || { echo "TTS_EMPTY_${i}" >> "$LOG"; exit 1; }`);
        }

        // 이미지 다운로드
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          if (s.image_url) {
            lines.push(`curl -sL --max-time 30 "${s.image_url}" -o "$DIR/img_${i}.jpg" 2>/dev/null || true`);
          }
        }

        // 이미지 폴백 (다운로드 실패 시 검은 배경)
        for (let i = 0; i < scenes.length; i++) {
          if (scenes[i].image_url) {
            lines.push(`[ -s "$DIR/img_${i}.jpg" ] || ${ffmpeg} -f lavfi -i color=c=0x1a1a2e:s=1080x1920:d=1 -frames:v 1 "$DIR/img_${i}.jpg" -y 2>>"$LOG"`);
          } else {
            lines.push(`${ffmpeg} -f lavfi -i color=c=0x1a1a2e:s=1080x1920:d=1 -frames:v 1 "$DIR/img_${i}.jpg" -y 2>>"$LOG"`);
          }
          lines.push(`IMG_${i}="$DIR/img_${i}.jpg"`);
        }

        // 씬별 렌더 (Ken Burns + ASS 자막)
        for (let i = 0; i < scenes.length; i++) {
          const dur = Math.max(1, scenes[i].duration);
          const kbVf = getKenBurnsVf(i, dur);
          const hasSubFile = !!(makeAssSubtitle(scenes[i].subtitle || '', dur));
          const assVf = hasSubFile ? `,ass=${jobDir}/sub_${i}.ass:fontsdir=${KO_FONT_DIR}` : '';
          const vf = `${kbVf}${assVf}`;

          lines.push(`echo "SCENE_${i}_START" >> "$LOG"`);
          lines.push(
            `${ffmpeg} -loop 1 -i "$IMG_${i}" -i "$DIR/tts_${i}.mp3" ` +
            `-vf "${vf}" ` +
            `-c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 128k -shortest -y "$DIR/scene_${i}.mp4" 2>>"$LOG"`
          );
        }

        // concat
        const filelistContent = scenes.map((_, i) => `file '${jobDir}/scene_${i}.mp4'`).join('\\n');
        lines.push(`printf '${filelistContent}\\n' > "$DIR/filelist.txt"`);
        lines.push(`echo "CONCAT_START" >> "$LOG"`);
        lines.push(
          `${ffmpeg} -f concat -safe 0 -i "$DIR/filelist.txt" ` +
          `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 128k -movflags +faststart -y "$DIR/final.mp4" 2>>"$LOG"`
        );
        lines.push('echo "RENDER_DONE" >> "$LOG"');
        lines.push('echo "RENDER_DONE"');

        await nasExecWithStdin(`cat > ${jobDir}/render.sh`, lines.join('\n'));

        // nohup으로 백그라운드 실행 → 서버 재시작해도 렌더 계속
        const bgStart = await nasExec(`nohup bash ${jobDir}/render.sh > ${jobDir}/render.log 2>&1 & echo $!`);
        const renderPid = bgStart.stdout.trim();
        if (!renderPid || isNaN(Number(renderPid))) throw new Error('렌더 프로세스 시작 실패');

        // 완료까지 폴링 (최대 5분)
        const deadline = Date.now() + 300_000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 8000));
          const check = await nasExec(`kill -0 ${renderPid} 2>/dev/null && echo RUNNING || echo DONE`);
          if (check.stdout.includes('DONE')) break;
          send({ type: 'progress', msg: 'NAS FFmpeg 렌더링 중...', pct: 54 + Math.round(((Date.now() - (deadline - 300_000)) / 300_000) * 25) });
        }

        const logCheck = await nasExec(`tail -3 ${jobDir}/render.log`);
        if (!logCheck.stdout.includes('RENDER_DONE')) {
          throw new Error('렌더 실패: ' + logCheck.stdout.slice(0, 300));
        }

        // ── 8. R2 업로드 ─────────────────────────────────────────────
        await upd('영상 R2 업로드 중...', { pct: 82 });
        const mp4 = await readFileAsBuffer(`${jobDir}/final.mp4`);
        if (!mp4 || mp4.length < 1000) throw new Error('렌더 파일 비어있음');
        const safe = body.title.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 30);
        const videoUrl = await uploadToR2(`shorts-auto/${Date.now()}_${safe}.mp4`, mp4, 'video/mp4');
        await nasExec(`rm -rf ${jobDir}`).catch(() => {});

        // ── 9. YouTube 업로드 ─────────────────────────────────────────
        await upd('YouTube 업로드 중...', { pct: 90, video_url: videoUrl });
        const videoAB = mp4.buffer.slice(mp4.byteOffset, mp4.byteOffset + mp4.byteLength) as ArrayBuffer;
        const ytDescription = [
          genData.description || body.description || body.title,
          body.blog_url ? `\n원본 블로그: ${body.blog_url}` : '',
        ].join('');
        const ytUrl = await ytUpload(userId, videoAB, genData.title || body.title, ytDescription, body.keyword ?? '');

        // ── 완료 ─────────────────────────────────────────────────────
        await admin.from('bossai_shorts_queue').update({
          status: 'done', progress: '완료!', pct: 100,
          video_url: videoUrl, yt_url: ytUrl ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        send({ type: 'done', job_id: jobId, video_url: videoUrl, yt_url: ytUrl ?? null, msg: '완료!' });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from('bossai_shorts_queue').update({
          status: 'error', progress: msg, error_message: msg,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        send({ type: 'error', job_id: jobId, msg });
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Job-ID': jobId,
    },
  });
}

// ── 쇼츠 스크립트 프롬프트 빌더 ─────────────────────────────────────────────
async function buildShortsPrompt(topic: string, duration: number): Promise<string> {
  const SCENE_MAP: Record<number, number> = { 15: 3, 30: 5, 60: 9, 120: 16, 180: 22 };
  const numScenes = SCENE_MAP[duration] ?? 9;
  const CHARS_PER_SEC = 9.5;

  const sceneDurations: number[] = [];
  for (let i = 0; i < numScenes; i++) {
    if (i === 0) sceneDurations.push(Math.max(3, Math.round(duration * 0.10)));
    else if (i === numScenes - 1) sceneDurations.push(Math.max(4, Math.round(duration * 0.10)));
    else sceneDurations.push(Math.max(4, Math.round((duration - sceneDurations[0] - Math.round(duration * 0.10)) / (numScenes - 2))));
  }
  const total = sceneDurations.reduce((a, b) => a + b, 0);
  if (total !== duration) sceneDurations[Math.floor(numScenes / 2)] += (duration - total);

  const sceneTemplate = sceneDurations.map((sec, i) =>
    `{"id":${i+1},"duration":${sec},"narration":"(최소 ${Math.round(sec*CHARS_PER_SEC)}자, 빠른 구어체, 친구에게 말하듯)","subtitle":"(이모지1개+임팩트문구, 10자이내, 이모지 제외)","image_query":"(이 씬 장면에 딱 맞는 Pixabay 검색어, 한국어 2~3단어, 주제와 직접 연관된 구체적 장면)"}`
  ).join(',\n    ');

  return `당신은 대한민국 최고의 숏폼 바이럴 크리에이터입니다. 아래 블로그 내용을 바탕으로 ${duration}초 YouTube Shorts 스크립트를 JSON으로만 출력하세요.

[블로그 주제 및 내용]
${topic}

[규칙]
• 나레이션: 친구에게 카톡 보내듯 빠른 구어체 (~야, ~거든, ~잖아)
• 각 씬 duration × 9.5자 이상 필수 (침묵 = 이탈)
• 훅: 첫 3초에 멈추게 하는 한 방
• 자막: 이모지1개 + 짧고 강렬한 감정 문구 (10자 이내, 이모지는 subtitle 필드 밖에 두지 말 것)
• image_query: 해당 씬 내용을 가장 잘 표현하는 Pixabay 검색어 (한국어 2~3단어, 예: "아파트 화재", "소방차 진화", "주민 대피"처럼 구체적으로)

JSON (이것만 출력):
{
  "title": "클릭 안 하면 손해인 제목 (숫자·감정 포함, 40자 이내)",
  "description": "SEO 설명 2~3줄 + 해시태그 5개",
  "hook": "썸네일 문구 (15자 이내)",
  "scenes": [
    ${sceneTemplate}
  ]
}`;
}
