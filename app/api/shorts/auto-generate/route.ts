import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { uploadToR2 } from '@/lib/r2-storage';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import { readFileAsBuffer } from '@/lib/nas-sftp';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const maxDuration = 10; // 즉시 응답, 백그라운드 처리

// ── FFmpeg 경로 탐색 ────────────────────────────────────────────────────────
async function findFfmpeg(): Promise<string> {
  const paths = ['ffmpeg','/usr/bin/ffmpeg','/usr/local/bin/ffmpeg','/tmp/ffmpeg',
    '/volume1/@appstore/ffmpeg/bin/ffmpeg','/var/packages/ffmpeg6/target/bin/ffmpeg'];
  for (const p of paths) {
    const r = await nasExec(`${p} -version 2>&1 | head -1`);
    if (r.code === 0 && r.stdout.includes('ffmpeg')) return p;
  }
  throw new Error('NAS FFmpeg 없음 — /dashboard/shorts 환경체크 실행 필요');
}

// ── TTS 생성 → R2 ────────────────────────────────────────────────────────────
async function genTtsUrl(text: string, voice: string): Promise<string> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR">
    <voice name="${voice}"><prosody rate="+10%">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</prosody></voice></speak>`;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TTS 타임아웃')), 25000);
    const { audioStream } = tts.toStream(ssml);
    audioStream.on('data', (d: Buffer) => chunks.push(d));
    audioStream.on('end', () => { clearTimeout(t); resolve(); });
    audioStream.on('error', (e: Error) => { clearTimeout(t); reject(e); });
  });
  const key = `shorts-tts/${Date.now()}_${Math.random().toString(36).slice(2,6)}.mp3`;
  return uploadToR2(key, Buffer.concat(chunks), 'audio/mpeg');
}

// ── 한국어 폰트 탐색 ─────────────────────────────────────────────────────────
async function findFont(): Promise<string | null> {
  const r = await nasExec('find /usr/share/fonts /volume1 -name "*.ttf" -o -name "*.otf" 2>/dev/null | grep -iE "nanum|gothic|KR$" | head -1');
  return r.stdout.trim() || null;
}

// ── YouTube 업로드 (토큰 직접 사용) ─────────────────────────────────────────
async function ytUpload(userId: string, videoBuffer: ArrayBuffer, title: string, description: string, keyword: string) {
  const admin = createAdminClient();
  const { data: conn } = await admin.from('sns_connections')
    .select('access_token, refresh_token, extra').eq('user_id', userId).eq('platform', 'youtube').eq('is_active', true).single();
  if (!conn) return null;

  let accessToken = conn.access_token;
  const expiresAt = conn.extra?.expires_at ? new Date(conn.extra.expires_at) : null;
  if (expiresAt && expiresAt <= new Date() && conn.refresh_token) {
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: conn.refresh_token, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token' }),
    });
    const td = await tr.json();
    if (td.access_token) {
      accessToken = td.access_token;
      await admin.from('sns_connections').update({ access_token: accessToken, extra: { expires_at: new Date(Date.now() + 3600000).toISOString() } }).eq('user_id', userId).eq('platform', 'youtube');
    }
  }

  const tags = ['Shorts','쇼츠', ...(keyword ? [keyword] : [])].slice(0, 30);
  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(videoBuffer.byteLength) },
    body: JSON.stringify({
      snippet: { title: title.slice(0, 100), description: `${description}\n\n#Shorts #쇼츠 #${keyword || ''}`.slice(0, 5000), tags, categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    }),
  });
  if (!initRes.ok) return null;
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) return null;
  const upRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoBuffer.byteLength) }, body: videoBuffer });
  if (!upRes.ok) return null;
  const d = await upRes.json();
  return d.id ? `https://www.youtube.com/shorts/${d.id}` : null;
}

// ── 백그라운드 파이프라인 ────────────────────────────────────────────────────
async function processJob(jobId: string, userId: string, title: string, keyword: string, description: string, content: string, cookieHeader: string) {
  const admin = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const upd = (progress: string, extra?: Record<string, unknown>) =>
    admin.from('bossai_shorts_queue').update({ progress, updated_at: new Date().toISOString(), ...extra }).eq('id', jobId);

  try {
    // 1. AI 스크립트 생성
    await upd('AI 스크립트 생성 중...');
    const topic = `${title}\n\n${description || content?.slice(0, 500) || ''}`;
    const genRes = await fetch(`${baseUrl}/api/shorts/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ topic, duration: 60, tone: 'info', platform: 'youtube', provider: 'gemini' }),
    });
    const genData = await genRes.json();
    if (!genData.scenes?.length) throw new Error('스크립트 생성 실패: ' + (genData.error || JSON.stringify(genData).slice(0, 100)));

    // 2. 이미지 검색
    await upd('이미지 검색 중...');
    const scenes: { id: number; narration: string; subtitle: string; duration: number; image_url: string; image_query: string }[] = genData.scenes;
    for (const s of scenes) {
      if (!s.image_query) continue;
      try {
        const imgRes = await fetch(`${baseUrl}/api/shorts/images?q=${encodeURIComponent(s.image_query)}&source=pixabay&per_page=3`, { headers: { Cookie: cookieHeader } });
        const imgData = await imgRes.json();
        if (imgData.images?.[0]?.url) s.image_url = imgData.images[0].url;
      } catch { /* 이미지 없으면 검은 배경 */ }
    }

    // 3. NAS FFmpeg 렌더
    await upd('TTS + 영상 생성 중... (~3분)');
    const ffmpeg = await findFfmpeg();
    const fontPath = await findFont();
    const jobDir = `/tmp/shorts_auto_${jobId.replace(/-/g, '').slice(0, 12)}`;
    await nasExec(`mkdir -p ${jobDir}`);

    // TTS 생성
    const voice = 'ko-KR-SunHiNeural';
    const ttsUrls: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      await upd(`TTS ${i + 1}/${scenes.length} 생성 중...`);
      ttsUrls.push(await genTtsUrl(scenes[i].narration, voice));
    }

    // 렌더 스크립트 빌드
    const escDt = (s: string) => s.replace(/[\\':]/g, '\\$&').replace(/\n/g, ' ').slice(0, 60);
    const renderLines = [
      '#!/bin/bash', 'set -e', `DIR="${jobDir}"`,
      ...scenes.flatMap((s, i) => [
        s.image_url ? `curl -sL --max-time 30 "${s.image_url}" -o "$DIR/img_${i}.jpg" 2>/dev/null || true` : '',
        `curl -sL --max-time 30 "${ttsUrls[i]}" -o "$DIR/tts_${i}.mp3"`,
        `[ -s "$DIR/img_${i}.jpg" ] || ${ffmpeg} -f lavfi -i color=c=0x1a1a2e:s=1080x1920:d=1 -frames:v 1 "$DIR/img_${i}.jpg" -y 2>/dev/null`,
        `IMG_${i}="$DIR/img_${i}.jpg"`,
      ].filter(Boolean)),
      ...scenes.map((s, i) => {
        const sub = escDt(s.subtitle || '');
        const vf = [`scale=1080:1920:force_original_aspect_ratio=increase`, `crop=1080:1920`,
          sub ? (fontPath ? `drawtext=fontfile='${fontPath}':text='${sub}':fontsize=52:fontcolor=white:x=(w-text_w)/2:y=h-220:shadowcolor=black@0.8:shadowx=3:shadowy=3:box=1:boxcolor=black@0.55:boxborderw=18`
            : `drawtext=text='${sub}':fontsize=46:fontcolor=white:x=(w-text_w)/2:y=h-220:shadowcolor=black@0.9:shadowx=3:shadowy=3`) : ''
          ].filter(Boolean).join(',');
        return `${ffmpeg} -loop 1 -t ${Math.max(1, s.duration)} -i "$IMG_${i}" -i "$DIR/tts_${i}.mp3" -vf "${vf}" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -y "$DIR/scene_${i}.mp4" 2>/dev/null`;
      }),
      `printf '${scenes.map((_,i) => `file '${jobDir}/scene_${i}.mp4'`).join('\\n')}\\n' > "$DIR/filelist.txt"`,
      `${ffmpeg} -f concat -safe 0 -i "$DIR/filelist.txt" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -y "$DIR/final.mp4" 2>/dev/null`,
      `echo "RENDER_DONE"`,
    ];

    await nasExecWithStdin(`cat > ${jobDir}/render.sh`, renderLines.join('\n'));
    const renderResult = await nasExec(`bash ${jobDir}/render.sh`);
    if (!renderResult.stdout.includes('RENDER_DONE')) throw new Error('렌더 실패: ' + renderResult.stderr.slice(0, 200));

    // 4. R2 업로드
    await upd('R2 업로드 중...');
    const mp4 = await readFileAsBuffer(`${jobDir}/final.mp4`);
    if (!mp4 || mp4.length < 1000) throw new Error('렌더된 파일이 비어있음');
    const safe = title.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 30);
    const videoUrl = await uploadToR2(`shorts-auto/${Date.now()}_${safe}.mp4`, mp4, 'video/mp4');
    await nasExec(`rm -rf ${jobDir}`).catch(() => {});

    await upd('YouTube 업로드 중...', { video_url: videoUrl });

    // 5. YouTube 업로드
    const ytUrl = await ytUpload(userId, mp4.buffer as ArrayBuffer, genData.title || title, description || title, keyword);
    await upd('완료!', { status: 'done', yt_url: ytUrl || null });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await upd(msg, { status: 'error', error_message: msg });
  }
}

// ── 라우트 핸들러 ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, title, keyword = '', description = '', content = '' } = await req.json();
  if (!title) return NextResponse.json({ error: 'title 필요' }, { status: 400 });

  const admin = createAdminClient();
  const { data: job } = await admin.from('bossai_shorts_queue').insert({
    user_id: user.id, article_id, title, keyword,
    status: 'pending', progress: '대기 중...',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select('id').single();

  if (!job) return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });

  const cookieHeader = req.headers.get('cookie') || '';

  // 백그라운드 실행 (응답 후 계속 실행)
  setImmediate(() => {
    processJob(job.id, user.id, title, keyword, description, content, cookieHeader).catch(console.error);
  });

  return NextResponse.json({ job_id: job.id, status: 'pending' });
}
