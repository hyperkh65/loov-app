import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

const BUCKETS = [
  { name: 'sns-media', folders: ['card-news'] },
  { name: 'bossai-images', folders: ['shorts'] },
];

// List all files in a bucket folder, paginated
async function listAllFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit, offset, sortBy: { column: 'created_at', order: 'asc' } });
    if (error || !data?.length) break;
    for (const f of data) {
      if (f.name && !f.id?.endsWith('/')) {
        paths.push(`${folder}/${f.name}`);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return paths;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const summary: Record<string, number> = {};
  for (const { name, folders } of BUCKETS) {
    let total = 0;
    for (const folder of folders) {
      const files = await listAllFiles(supabase, name, folder);
      total += files.length;
    }
    summary[name] = total;
  }
  return NextResponse.json({ summary });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { bucket, folder } = await req.json() as { bucket: string; folder?: string };

  const target = BUCKETS.find(b => b.name === bucket);
  if (!target) return NextResponse.json({ error: '유효하지 않은 버킷' }, { status: 400 });

  const foldersToClean = folder ? [folder] : target.folders;
  let deleted = 0;

  for (const f of foldersToClean) {
    const files = await listAllFiles(supabase, bucket, f);
    // Delete in batches of 100
    for (let i = 0; i < files.length; i += 100) {
      const batch = files.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (!error) deleted += batch.length;
    }
  }

  return NextResponse.json({ ok: true, deleted });
}
