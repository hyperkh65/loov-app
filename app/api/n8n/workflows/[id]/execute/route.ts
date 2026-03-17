import { NextRequest, NextResponse } from 'next/server';
import { n8nCli } from '@/lib/nas-ssh';

// POST: 워크플로우 수동 실행
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;

    // 백그라운드로 실행 (타임아웃 방지용 nohup)
    const result = await n8nCli(`execute --id=${id} --rawOutput`);

    return NextResponse.json({
      ok: true,
      stdout: result.stdout.slice(-2000),
      stderr: result.stderr.slice(-500),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
