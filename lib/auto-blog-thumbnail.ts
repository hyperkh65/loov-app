import { createAdminClient } from './supabase-server';

// /api/gen-thumbnail 호출 → PNG 반환 → Supabase Storage 업로드
export async function generateAndUploadThumbnail(
  title: string,
  keyword: string,
  colorScheme: 'blue' | 'dark' | 'green' = 'blue',
  bgImageUrl?: string,
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';

  const params = new URLSearchParams({ title, keyword, color: colorScheme });
  if (bgImageUrl) params.set('bg', bgImageUrl);

  const genUrl = `${appUrl}/api/gen-thumbnail?${params.toString()}`;
  const res = await fetch(genUrl, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`썸네일 생성 실패: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());

  const supabase = createAdminClient();
  const filename = `thumbnails/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;

  // 버킷 생성 시도 (이미 존재하면 에러 무시)
  const { error: bucketErr } = await supabase.storage.createBucket('auto-blog', { public: true });
  if (bucketErr && !bucketErr.message.includes('already exist') && !bucketErr.message.includes('duplicate')) {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: { name: string }) => b.name === 'auto-blog');
    if (!exists) {
      throw new Error('Supabase Storage "auto-blog" 버킷이 없습니다. Supabase Dashboard → Storage에서 auto-blog 버킷을 Public으로 생성해주세요.');
    }
  }

  const { error } = await supabase.storage
    .from('auto-blog')
    .upload(filename, buffer, { contentType: 'image/png', upsert: true });

  if (error) throw new Error(`썸네일 업로드 실패: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from('auto-blog').getPublicUrl(filename);
  return publicUrl;
}
