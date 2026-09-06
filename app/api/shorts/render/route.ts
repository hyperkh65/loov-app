import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { renderShortsVideo, type RenderScene } from '@/lib/shorts/render-core';

export const maxDuration = 300;

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

      try {
        const result = await renderShortsVideo(scenes, {
          voice, rate, title, addSubtitles, kenBurns,
          onProgress: (step, total, message) => send('progress', { step, total, message }),
        });
        send('done', result);
      } catch (e) {
        send('error', { message: e instanceof Error ? e.message : String(e) });
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
