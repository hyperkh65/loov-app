import { NextRequest, NextResponse } from 'next/server';
import { writeFileFromBase64 } from '@/lib/nas-sftp';

const NAS_ROOT = '/volume1/homes/urjent/loov';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const rawDir = (form.get('dir') as string) || NAS_ROOT;
    const dir = rawDir.replace(/\.\.+/g, '').startsWith(NAS_ROOT) ? rawDir : NAS_ROOT;
    const files = form.getAll('files') as File[];

    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');
        const destPath = dir.replace(/\/$/, '') + '/' + file.name;
        await writeFileFromBase64(destPath, base64);
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
