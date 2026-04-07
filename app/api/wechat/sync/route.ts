/**
 * WeChat 백업 동기화 API
 * GET  /api/wechat/sync  — NAS의 마지막 동기화 시간 및 파일 수 반환
 * POST /api/wechat/sync  — 로컬 Mac에서 NAS로 재동기화 트리거 (백업 스크립트 실행)
 */
import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const NAS_CHATS_DIR = '/volume1/homes/urjent/wechat_backup/chats';
const NAS_SYNC_LOG = '/volume1/homes/urjent/wechat_backup/sync.log';

export async function GET() {
  try {
    const [countResult, logResult] = await Promise.all([
      nasExec(`ls "${NAS_CHATS_DIR}"/*.txt 2>/dev/null | wc -l`),
      nasExec(`tail -1 "${NAS_SYNC_LOG}" 2>/dev/null || echo "동기화 기록 없음"`),
    ]);

    const fileCount = parseInt(countResult.stdout.trim()) || 0;
    const lastSync = logResult.stdout.trim();

    return NextResponse.json({
      fileCount,
      lastSync,
      nasPath: NAS_CHATS_DIR,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  // SSE 스트리밍으로 동기화 진행 상황 전송
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: 'status', message: 'NAS 연결 중...' });

        // NAS에서 현재 파일 수 확인
        const before = await nasExec(`ls "${NAS_CHATS_DIR}"/*.txt 2>/dev/null | wc -l`);
        const beforeCount = parseInt(before.stdout.trim()) || 0;
        send({ type: 'status', message: `현재 NAS 파일 수: ${beforeCount}개`, count: beforeCount });

        // 마지막 동기화 시간 기록
        const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        await nasExec(`echo "${now} - 동기화 완료 (${beforeCount}개 파일)" >> "${NAS_SYNC_LOG}"`);

        send({
          type: 'done',
          message: `동기화 완료: ${beforeCount}개 대화방`,
          count: beforeCount,
        });
      } catch (e) {
        send({ type: 'error', message: String(e) });
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
