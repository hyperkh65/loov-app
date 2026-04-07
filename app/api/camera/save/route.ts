import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { createClient, createAdminClient } from '@/lib/supabase-server';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, filter, filterCss, location, notionDbId, metadata } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: '이미지 없음' }, { status: 400 });

    // 1. Cloudinary 업로드
    let cloudinaryUrl = '';
    let thumbnailUrl = '';
    if (process.env.CLOUDINARY_API_KEY) {
      const result = await cloudinary.uploader.upload(imageBase64, {
        folder: 'loov-camera',
        tags: ['camera', filter || 'normal'],
        context: location ? `lat=${location.lat}|lng=${location.lng}` : '',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });
      cloudinaryUrl = result.secure_url;
      thumbnailUrl = cloudinary.url(result.public_id, { width: 400, height: 400, crop: 'fill', quality: 'auto', fetch_format: 'auto' });
    }

    // 2. Supabase 저장 (크로스 디바이스 동기화)
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();

    const sbAdmin = createAdminClient();
    const photoId = metadata?.id || Date.now().toString();
    const { data: savedPhoto, error: dbError } = await sbAdmin
      .from('camera_photos')
      .upsert({
        id: photoId,
        user_id: user?.id ?? null,
        cloudinary_url: cloudinaryUrl || imageBase64.substring(0, 200),
        thumbnail_url: thumbnailUrl,
        filter: filter || 'normal',
        filter_css: filterCss || '',
        timestamp: metadata?.timestamp || new Date().toLocaleString('ko-KR'),
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (dbError) console.error('Supabase save error:', dbError);

    // 3. Notion 저장 (선택)
    let notionPageId = '';
    if (process.env.NOTION_API_KEY && notionDbId && cloudinaryUrl) {
      try {
        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent: { database_id: notionDbId },
            properties: {
              이름: { title: [{ type: 'text', text: { content: `📸 ${metadata?.timestamp || new Date().toISOString()}` } }] },
              필터: { rich_text: [{ type: 'text', text: { content: filter || 'normal' } }] },
              촬영일시: { date: { start: new Date().toISOString() } },
              이미지: { files: [{ type: 'external', name: '사진', external: { url: cloudinaryUrl } }] },
            },
          }),
        });
        const d = await res.json();
        notionPageId = d.id || '';
      } catch {}
    }

    return NextResponse.json({ cloudinaryUrl, thumbnailUrl, notionPageId, photoId: savedPhoto?.id || photoId, ok: true });
  } catch (err: any) {
    console.error('Camera save error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 갤러리 로드 (모든 기기에서 공유)
export async function GET(req: NextRequest) {
  try {
    const sbAdmin = createAdminClient();
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();

    let query = sbAdmin.from('camera_photos').select('*').order('created_at', { ascending: false }).limit(200);
    if (user) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ photos: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 사진 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const sbAdmin = createAdminClient();
    const { error } = await sbAdmin.from('camera_photos').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
