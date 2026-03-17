import { NextRequest, NextResponse } from 'next/server';
import { n8nQuery } from '@/lib/nas-ssh';

// GET: 실행 히스토리
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;

    const result = await n8nQuery(
      `SELECT id, mode, status, "startedAt", "stoppedAt",
        EXTRACT(EPOCH FROM ("stoppedAt" - "startedAt")) as duration_sec
       FROM execution_entity
       WHERE "workflowId"='${id}'
       ORDER BY "startedAt" DESC LIMIT 20`
    );

    const executions = result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [eid, mode, status, startedAt, stoppedAt, duration] = line.split('|');
        return {
          id: eid,
          mode,
          status,
          startedAt,
          stoppedAt,
          durationSec: parseFloat(duration || '0'),
        };
      });

    return NextResponse.json({ executions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
