/**
 * WeChat 백업 트리거 API
 * POST /api/wechat/backup-trigger  — NAS에 trigger 파일 작성 → SSE로 상태 스트리밍
 * GET  /api/wechat/backup-trigger  — 현재 백업 상태 조회
 */
import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const NAS_BASE   = '/volume1/homes/urjent/wechat_backup';
const TRIGGER    = `${NAS_BASE}/backup_trigger`;
const STATUS     = `${NAS_BASE}/backup_status.json`;

export async function GET() {
  try {
    const r = await nasExec(`cat ${STATUS} 2>/dev/null || echo '{}'`);
    const status = JSON.parse(r.stdout || '{}');
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ status: 'unknown' });
  }
}

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        send({ status: 'triggering', message: 'Mac 데몬에 신호 전송 중...' });

        // 데몬 활성 확인
        const statusR = await nasExec(`cat ${STATUS} 2>/dev/null || echo '{}'`);
        const prev = JSON.parse(statusR.stdout || '{}');
        if (prev.daemon !== 'running' && prev.status !== 'idle' && prev.status !== 'done' && prev.status !== 'error') {
          send({ status: 'error', message: 'Mac 백업 데몬이 실행 중이지 않습니다. Mac에서 데몬을 확인하세요.' });
          controller.close(); return;
        }

        // trigger 파일 작성
        const now = new Date().toISOString();
        await nasExec(`echo "${now}" > ${TRIGGER}`);
        send({ status: 'triggered', message: '백업 시작 요청됨. Mac에서 처리 중...' });

        // 최대 5분 동안 30초 간격으로 상태 폴링
        const maxWait = 60 * 5;
        let elapsed = 0;
        let lastStatus = '';

        while (elapsed < maxWait) {
          await new Promise(r => setTimeout(r, 3000));
          elapsed += 3;

          const sr = await nasExec(`cat ${STATUS} 2>/dev/null || echo '{}'`);
          let s: { status?: string; message?: string; finished?: string } = {};
          try { s = JSON.parse(sr.stdout || '{}'); } catch { /**/ }

          if (s.status !== lastStatus) {
            lastStatus = s.status ?? '';
            send({
              status: s.status,
              message: s.message ?? '',
              finished: s.finished,
              elapsed,
            });
          }

          if (s.status === 'done' || s.status === 'error') break;
        }

        if (elapsed >= maxWait) {
          send({ status: 'timeout', message: '타임아웃: Mac 데몬 응답 없음' });
        }
      } catch (e) {
        send({ status: 'error', message: String(e) });
      } finally {
        controller.close();
      }
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
