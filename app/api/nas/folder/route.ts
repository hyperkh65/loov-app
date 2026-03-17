import { NextRequest, NextResponse } from 'next/server';
import { createFolder, deleteItem, renameItem } from '@/lib/nas-sftp';

// POST: 폴더 생성
export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json();
    await createFolder(path);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE: 파일/폴더 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { path, isDir } = await req.json();
    await deleteItem(path, !!isDir);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH: 이름 변경
export async function PATCH(req: NextRequest) {
  try {
    const { oldPath, newPath } = await req.json();
    await renameItem(oldPath, newPath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
