import { NextRequest, NextResponse } from 'next/server';
import { writeFileStream } from '@/lib/nas-sftp';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const dir = (form.get('dir') as string) || '/volume1';
    const files = form.getAll('files') as File[];

    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const destPath = dir.replace(/\/$/, '') + '/' + file.name;
        await writeFileStream(destPath, buffer);
        results.push({ name: file.name, ok: true });
      } catch (e) {
        results.push({ name: file.name, ok: false, error: String(e) });
      }
    }

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const config = { api: { bodyParser: false } };
