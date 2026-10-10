/**
 * 이미지를 선택한 모든 WordPress 사이트의 미디어 라이브러리에 업로드
 * POST: FormData { meta: JSON({ siteIds }), images: File[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export interface ImageUploadResult {
  id?: number;
  url?: string;
  error?: string;
}

export interface SiteUploadResult {
  siteId: string;
  siteName: string;
  images: ImageUploadResult[];
  error?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const formData = await req.formData();
  const metaRaw = formData.get('meta') as string | null;
  if (!metaRaw) return NextResponse.json({ error: 'meta 누락' }, { status: 400 });

  const { siteIds } = JSON.parse(metaRaw) as { siteIds: string[] };
  const files = formData.getAll('images') as File[];

  if (!files.length) return NextResponse.json({ error: '이미지 없음' }, { status: 400 });
  if (!siteIds?.length) return NextResponse.json({ error: '사이트 선택 필요' }, { status: 400 });

  const { data: sites } = await supabase
    .from('wordpress_sites')
    .select('id, site_name, site_url, wp_username, app_password')
    .eq('user_id', user.id)
    .in('id', siteIds);

  if (!sites?.length) return NextResponse.json({ error: '유효한 사이트 없음' }, { status: 400 });

  // 파일 버퍼를 미리 읽어둠 (여러 사이트 반복 시 재사용)
  const fileBuffers: ArrayBuffer[] = await Promise.all(
    files.map((f) => f.arrayBuffer())
  );

  const results: SiteUploadResult[] = [];

  for (const site of sites) {
    const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');
    const images: ImageUploadResult[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = fileBuffers[i];
        try {
          const blob = new Blob([buffer], { type: file.type || 'image/jpeg' });
          const res = await fetch(`${site.site_url}/wp-json/wp/v2/media`, {
            method: 'POST',
            headers: {
              Authorization: auth,
              'Content-Type': file.type || 'image/jpeg',
              'Content-Disposition': `attachment; filename="${file.name.replace(/[^\w.-]/g, '_')}"`,
            },
            body: blob,
          });
          if (res.ok) {
            const data = await res.json();
            images.push({ id: data.id, url: data.source_url });
          } else {
            const errText = await res.text();
            const errMsg = `HTTP ${res.status}: ${errText.slice(0, 120)}`;
            console.error(`[WP media] ${site.site_name}:`, errMsg);
            images.push({ error: errMsg });
          }
        } catch (e) {
          const errMsg = String(e);
          console.error('[WP media] 업로드 예외:', errMsg);
          images.push({ error: errMsg });
        }
      }
      results.push({ siteId: site.id, siteName: site.site_name, images });
    } catch (e) {
      results.push({
        siteId: site.id, siteName: site.site_name,
        images: files.map(() => ({ error: String(e) })),
        error: String(e),
      });
    }
  }

  return NextResponse.json({ results });
}
