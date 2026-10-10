import { NextRequest, NextResponse } from 'next/server';
import { n8nCli, n8nQuery } from '@/lib/nas-ssh';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { active } = await req.json();
    const { id } = await params;

    const result = await n8nCli(`update:workflow --id=${id} --active=${active}`);

    if (result.code !== 0 && result.stderr && !result.stderr.includes('DEPRECATED')) {
      return NextResponse.json({ error: result.stderr }, { status: 500 });
    }

    const check = await n8nQuery(`SELECT id, name, active FROM workflow_entity WHERE id='${id}'`);
    const row = check.stdout.split('|');

    return NextResponse.json({
      ok: true,
      workflow: { id: row[0], name: row[1], active: row[2] === 't' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await n8nQuery(
      `SELECT id, name, active FROM workflow_entity WHERE id='${id}'`
    );
    const [wid, name, active] = result.stdout.split('|');
    return NextResponse.json({ id: wid, name, active: active === 't' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
