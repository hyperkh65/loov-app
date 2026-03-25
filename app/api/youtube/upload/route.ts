import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 300;

async function refreshYouTubeToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('토큰 갱신 실패: ' + (data.error_description || data.error));
  return data.access_token;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  // Get YouTube connection
  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, refresh_token, extra')
    .eq('user_id', user.id)
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .single();

  if (!conn) return NextResponse.json({ error: 'YouTube 미연결' }, { status: 400 });

  // Refresh token if needed
  let accessToken = conn.access_token;
  const expiresAt = conn.extra?.expires_at ? new Date(conn.extra.expires_at) : null;
  if (expiresAt && expiresAt <= new Date() && conn.refresh_token) {
    accessToken = await refreshYouTubeToken(conn.refresh_token);
    await supabase.from('sns_connections').update({
      access_token: accessToken,
      extra: { expires_at: new Date(Date.now() + 3600 * 1000).toISOString() },
    }).eq('user_id', user.id).eq('platform', 'youtube');
  }

  const formData = await req.formData();
  const videoBlob = formData.get('video') as File | null;
  const title = (formData.get('title') as string) || '카드뉴스 쇼츠';
  const description = (formData.get('description') as string) || '';
  const tags = (formData.get('tags') as string) || '';

  if (!videoBlob) return NextResponse.json({ error: '영상 파일 없음' }, { status: 400 });

  const videoBuffer = await videoBlob.arrayBuffer();

  // Step 1: Initiate resumable upload
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': videoBlob.type || 'video/webm',
        'X-Upload-Content-Length': String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: title.slice(0, 100),
          description: description.slice(0, 5000),
          tags: tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : ['카드뉴스', 'shorts'],
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    return NextResponse.json({ error: 'YouTube 업로드 시작 실패: ' + err }, { status: 500 });
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) return NextResponse.json({ error: 'upload URL 없음' }, { status: 500 });

  // Step 2: Upload video bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': videoBlob.type || 'video/webm',
      'Content-Length': String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return NextResponse.json({ error: 'YouTube 업로드 실패: ' + err }, { status: 500 });
  }

  const videoData = await uploadRes.json();
  const videoId = videoData.id;
  const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

  return NextResponse.json({ success: true, videoId, url: videoUrl });
}
