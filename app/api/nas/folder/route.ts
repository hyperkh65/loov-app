import { NextRequest, NextResponse } from 'next/server';
import { createFolder, deleteItem, renameItem } from '@/lib/nas-sftp';

const NAS_ROOT = '/volume1/homes/urjent/loov';

function safe(p: string): string {
  const clean = (p || '').replace(/\.\.+/g, '');
  if (!clean.startsWith(NAS_ROOT)) throw new Error('허용된 경로 외부 접근 불가');
  return clean;
}

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json();
    await createFolder(safe(path));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { path, isDir } = await req.json();
    await deleteItem(safe(path), !!isDir);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { oldPath, newPath } = await req.json();
    await renameItem(safe(oldPath), safe(newPath));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
