import { NextResponse } from 'next/server';
import { n8nQuery } from '@/lib/nas-ssh';

export async function GET() {
  try {
    const wfResult = await n8nQuery(
      `SELECT w.id, w.name, w.active,
        (SELECT COUNT(*) FROM execution_entity e WHERE e."workflowId" = w.id) as total_runs,
        (SELECT e.status FROM execution_entity e WHERE e."workflowId" = w.id ORDER BY e."startedAt" DESC LIMIT 1) as last_status,
        (SELECT e."startedAt" FROM execution_entity e WHERE e."workflowId" = w.id ORDER BY e."startedAt" DESC LIMIT 1) as last_run
       FROM workflow_entity w ORDER BY w."createdAt" DESC`
    );

    const workflows = wfResult.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const parts = line.split('|');
        return {
          id: parts[0],
          name: parts[1],
          active: parts[2] === 't',
          totalRuns: parseInt(parts[3] || '0'),
          lastStatus: parts[4] || null,
          lastRun: parts[5] || null,
        };
      });

    return NextResponse.json({ workflows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
