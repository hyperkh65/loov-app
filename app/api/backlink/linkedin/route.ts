import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { publishToLinkedIn } from '@/lib/linkedin-publish';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, keyword, canonical_url } = await req.json() as {
    title: string;
    meta_description?: string;
    keyword?: string;
    canonical_url: string;
  };

  if (!title || !canonical_url) return NextResponse.json({ error: 'title, canonical_url 필요' }, { status: 400 });

  try {
    const { url } = await publishToLinkedIn({ title, meta_description, keyword, canonical_url });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const accessToken = await getSetting('LINKEDIN_ACCESS_TOKEN');
  return NextResponse.json({ configured: !!accessToken });
}
