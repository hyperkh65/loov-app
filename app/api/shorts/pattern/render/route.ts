import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import { readFileAsBuffer } from '@/lib/nas-sftp';
import { uploadToR2 } from '@/lib/r2-storage';
import { findFfmpeg, findKoreanFont, escapeDrawtext } from '@/lib/shorts/nas-ffmpeg';
import { validatePatternClips, PATTERN_COLORS, type PatternClip, type PatternScript } from '@/lib/shorts/pattern-types';

export const maxDuration = 300;

const W = 1080, H = 1920;

// #RRGGBB → 0xRRGGBB (ffmpeg drawtext/drawbox 색상 표기)
function toFfColor(hex: string): string {
  return '0x' + hex.replace('#', '');
}

// 문장 길이에 따라 폰트 크기를 줄여 1줄 안에 대략 들어가게 한다(자동 줄바꿈은 하지 않음).
function fitFontSize(text: string, base: number, min: number): number {
  const over = Math.max(0, text.length - 22);
  return Math.max(min, Math.round(base - over * 1.1));
}

interface SceneLayout { y1: number; y2: number; fs1: number; fs2: number }

// 위/아래 텍스트 위치(사람 얼굴이 화면 중앙~하단에 있을 가능성이 높은 42~58% 구간을 피한다).
function layoutFor(position: 'upper' | 'lower', sentence: string, chunk: string): SceneLayout {
  const fs1 = fitFontSize(sentence, 50, 30);
  const fs2 = fitFontSize(chunk.toUpperCase(), 62, 38);
  const y1 = position === 'upper' ? Math.round(H * 0.13) : Math.round(H * 0.64);
  const y2 = y1 + fs1 + 22;
  return { y1, y2, fs1, fs2 };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: '로그인 필요' }), { status: 401 });
  }

  const { script, clips } = await req.json() as { script?: PatternScript; clips?: PatternClip[] };
  if (!script || !clips) {
    return new Response(JSON.stringify({ error: 'script/clips가 필요합니다' }), { status: 400 });
  }
  const validationError = validatePatternClips(clips);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)); } catch {}
      };
      const sendErr = (msg: string) => { send('error', { message: msg }); controller.close(); };

      try {
        send('progress', { step: 1, total: 4, message: 'NAS FFmpeg/폰트 확인 중...' });
        const ffmpeg = await findFfmpeg();
        const fontPath = await findKoreanFont();
        const fontArg = fontPath ? `fontfile='${fontPath}'` : '';

        const jobId = `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const dir = `/tmp/${jobId}`;
        await nasExec(`mkdir -p ${dir}`);

        send('progress', { step: 2, total: 4, message: `클립 ${clips.length}개 다운로드 및 NAS에서 합성 중...` });

        const lines: string[] = [`#!/bin/bash`, `set -e`, `DIR="${dir}"`];

        // ── 1. 원본 클립 다운로드 ──────────────────────────────────────────
        clips.forEach((c, i) => {
          lines.push(`curl -sL --max-time 40 "${c.videoUrl}" -o "$DIR/src_${i}.mp4"`);
        });

        // ── 2. 화자 clip별로 트림+스케일+2줄 자막(문맥 흰색 / 타겟청크 강조색)
        //      + 타겟청크 밑줄바(정적 — 160ms 성장 애니메이션은 폰트 지표 없이
        //      안전하게 계산할 수 없어 생략. 필요해지면 drawbox의 w에 시간식을 추가) ──
        clips.forEach((c, i) => {
          const { y1, y2, fs1, fs2 } = layoutFor(c.textPosition, c.sentence, c.targetChunk);
          const sentence = escapeDrawtext(c.sentence);
          const chunk = escapeDrawtext(c.targetChunk.toUpperCase());
          const underlineW = Math.min(W - 80, Math.round(chunk.length * fs2 * 0.58));
          const underlineX = Math.round((W - underlineW) / 2);
          const underlineY = y2 + fs2 + 12;

          const vf = [
            `scale=${W}:${H}:force_original_aspect_ratio=increase`,
            `crop=${W}:${H}`,
            `drawtext=${fontArg ? fontArg + ':' : ''}text='${sentence}':fontsize=${fs1}:fontcolor=${toFfColor(PATTERN_COLORS.primary)}:x=(w-text_w)/2:y=${y1}:shadowcolor=black@0.85:shadowx=2:shadowy=2:box=1:boxcolor=black@0.35:boxborderw=14`,
            `drawtext=${fontArg ? fontArg + ':' : ''}text='${chunk}':fontsize=${fs2}:fontcolor=${toFfColor(PATTERN_COLORS.accent)}:x=(w-text_w)/2:y=${y2}:shadowcolor=black@0.9:shadowx=2:shadowy=2`,
            `drawbox=x=${underlineX}:y=${underlineY}:w=${underlineW}:h=5:color=${toFfColor(PATTERN_COLORS.accent)}@1:t=fill`,
          ].join(',');

          lines.push(`HAS_A_${i}=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$DIR/src_${i}.mp4" 2>/dev/null | head -1)`);
          lines.push(`if [ -n "$HAS_A_${i}" ]; then`);
          lines.push(
            `  ${ffmpeg} -ss ${c.startAt} -t ${c.duration} -i "$DIR/src_${i}.mp4" ` +
            `-vf "${vf}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 128k -ar 44100 -ac 2 -r 30 -y "$DIR/scene_${i}.mp4" 2>/dev/null`
          );
          lines.push(`else`);
          lines.push(
            `  ${ffmpeg} -ss ${c.startAt} -t ${c.duration} -i "$DIR/src_${i}.mp4" ` +
            `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -shortest ` +
            `-vf "${vf}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
            `-c:a aac -b:a 128k -r 30 -y "$DIR/scene_${i}.mp4" 2>/dev/null`
          );
          lines.push(`fi`);
        });

        // ── 3. HERO 카드 — 타겟 표현 + (0.5초 후) 한국어 리콜 문구 ─────────────
        const heroDur = 2.4;
        const heroText = escapeDrawtext(script.targetExpression.toUpperCase());
        const heroKo = escapeDrawtext(script.koreanRecallPrompt || script.coreMeaning);
        lines.push(
          `${ffmpeg} -f lavfi -i "color=c=${toFfColor(PATTERN_COLORS.bg)}:s=${W}x${H}:d=${heroDur}" ` +
          `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -shortest ` +
          `-vf "drawtext=${fontArg ? fontArg + ':' : ''}text='${heroText}':fontsize=64:fontcolor=${toFfColor(PATTERN_COLORS.accent)}:x=(w-text_w)/2:y=(h-text_h)/2-40,` +
          `drawtext=${fontArg ? fontArg + ':' : ''}text='${heroKo}':fontsize=38:fontcolor=${toFfColor(PATTERN_COLORS.korean)}:x=(w-text_w)/2:y=(h/2)+60:enable='gte(t,0.5)'" ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -r 30 -y "$DIR/card_hero.mp4" 2>/dev/null`
        );

        // ── 4. PATTERN RECOGNITION 카드 — micro grammar pattern ───────────
        const patternDur = 2.0;
        const patternText = escapeDrawtext(script.microGrammarPattern || script.targetChunk);
        lines.push(
          `${ffmpeg} -f lavfi -i "color=c=${toFfColor(PATTERN_COLORS.bg)}:s=${W}x${H}:d=${patternDur}" ` +
          `-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -shortest ` +
          `-vf "drawtext=${fontArg ? fontArg + ':' : ''}text='${patternText}':fontsize=44:fontcolor=${toFfColor(PATTERN_COLORS.primary)}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.3:boxborderw=16" ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -r 30 -y "$DIR/card_pattern.mp4" 2>/dev/null`
        );

        // ── 5. QUICK RECALL 카드 — 한국어(무음) → 0.7초 pause → 영어(clip[0] 원음) ──
        const koDur = 1.3, pause = 0.7, enDur = Math.min(2.5, Math.max(1.5, clips[0].duration));
        const recallTotal = koDur + pause + enDur;
        const recallKo = escapeDrawtext(script.koreanRecallPrompt || script.coreMeaning);
        const recallEn = escapeDrawtext(script.targetExpression);
        lines.push(`RECALL_HAS_A=$HAS_A_0`);
        lines.push(`if [ -n "$RECALL_HAS_A" ]; then`);
        lines.push(
          `  ${ffmpeg} -ss ${clips[0].startAt} -t ${enDur} -i "$DIR/src_0.mp4" -vn -acodec libmp3lame -ar 44100 -ac 2 -y "$DIR/recall_voice.mp3" 2>/dev/null`
        );
        lines.push(
          `  ${ffmpeg} -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -t ${koDur + pause} -y "$DIR/recall_silence.mp3" 2>/dev/null`
        );
        lines.push(
          `  ${ffmpeg} -i "$DIR/recall_silence.mp3" -i "$DIR/recall_voice.mp3" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" -map "[a]" -y "$DIR/recall_audio.mp3" 2>/dev/null`
        );
        lines.push(`else`);
        lines.push(
          `  ${ffmpeg} -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" -t ${recallTotal} -y "$DIR/recall_audio.mp3" 2>/dev/null`
        );
        lines.push(`fi`);
        lines.push(
          `${ffmpeg} -f lavfi -i "color=c=${toFfColor(PATTERN_COLORS.bg)}:s=${W}x${H}:d=${recallTotal}" -i "$DIR/recall_audio.mp3" ` +
          `-vf "drawtext=${fontArg ? fontArg + ':' : ''}text='${recallKo}':fontsize=42:fontcolor=${toFfColor(PATTERN_COLORS.korean)}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,${koDur})',` +
          `drawtext=${fontArg ? fontArg + ':' : ''}text='${recallEn}':fontsize=52:fontcolor=${toFfColor(PATTERN_COLORS.accent)}:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(t,${koDur + pause})'" ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -r 30 -y "$DIR/card_recall.mp4" 2>/dev/null`
        );

        // ── 6. concat: scene_0..N + hero + pattern + recall ────────────────
        const parts = [...clips.map((_, i) => `scene_${i}`), 'card_hero', 'card_pattern', 'card_recall'];
        const filelistLines = parts.map(p => `file '${dir}/${p}.mp4'`);
        lines.push(`printf '${filelistLines.join('\\n')}\\n' > "$DIR/filelist.txt"`);
        lines.push(
          `${ffmpeg} -f concat -safe 0 -i "$DIR/filelist.txt" ` +
          `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 128k -movflags +faststart -y "$DIR/final.mp4" 2>/dev/null`
        );
        lines.push(`echo "RENDER_DONE"`);

        const script_ = lines.join('\n');
        await nasExecWithStdin(`cat > ${dir}/render.sh`, script_);

        const renderResult = await nasExec(`bash ${dir}/render.sh`);
        if (!renderResult.stdout.includes('RENDER_DONE')) {
          throw new Error('렌더링 실패: ' + (renderResult.stderr || renderResult.stdout).slice(0, 500));
        }

        // ── 7. 결과 파일 회수 → R2 업로드 ───────────────────────────────────
        send('progress', { step: 3, total: 4, message: 'R2에 업로드 중...' });
        const mp4Buffer = await readFileAsBuffer(`${dir}/final.mp4`);
        if (!mp4Buffer || mp4Buffer.length < 1000) {
          throw new Error('렌더링된 파일이 비어있습니다');
        }

        const safeTitle = script.targetExpression.replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 30);
        const r2Key = `shorts-pattern/${Date.now()}_${safeTitle}.mp4`;
        const videoUrl = await uploadToR2(r2Key, mp4Buffer, 'video/mp4');

        await nasExec(`rm -rf ${dir}`).catch(() => {});

        send('progress', { step: 4, total: 4, message: '완료!' });
        send('done', { url: videoUrl, size: mp4Buffer.length, clips: clips.length });
      } catch (e) {
        sendErr(e instanceof Error ? e.message : String(e));
        return;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
