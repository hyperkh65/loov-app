import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    title, content, tags = [], categoryNo = 0, status = 'publish', notionPageId = '',
    jobType = 'draft', sourceUrl, aiPrompt, aiProvider = 'gemini', thumbnailPrompt, scheduledAt,
  } = await req.json() as {
    title: string; content?: string; tags?: string[];
    categoryNo?: number; status?: string; notionPageId?: string;
    jobType?: 'draft' | 'rewrite' | 'scrape';
    sourceUrl?: string; aiPrompt?: string;
    aiProvider?: 'gemini' | 'claude' | 'gpt4o' | 'gpt4' | 'gpt35';
    thumbnailPrompt?: string; scheduledAt?: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });

  // draft/rewrite는 content 필수
  if (jobType === 'draft' && !content?.trim()) {
    return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });
  }
  if (jobType === 'rewrite' && !content?.trim()) {
    return NextResponse.json({ error: 'rewrite 모드는 초안(content)이 필요합니다' }, { status: 400 });
  }
  // scrape는 source_url 필수
  if (jobType === 'scrape' && !sourceUrl?.trim()) {
    return NextResponse.json({ error: 'scrape 모드는 source_url이 필요합니다' }, { status: 400 });
  }

  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id) return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다' }, { status: 400 });
  if (!conn.nid_aut || !conn.nid_ses) return NextResponse.json({ error: '네이버 쿠키(NID_AUT, NID_SES)를 설정 탭에서 입력해주세요' }, { status: 400 });

  const { data: job, error: jobErr } = await supabase
    .from('naver_publish_jobs')
    .insert({
      user_id: user.id,
      title: title.trim(),
      content: content || '',
      tags,
      category_no: categoryNo,
      is_publish: status === 'publish',
      notion_page_id: notionPageId,
      status: 'pending',
      job_type: jobType,
      source_url: sourceUrl || null,
      ai_prompt: aiPrompt || null,
      ai_provider: aiProvider,
      thumbnail_prompt: thumbnailPrompt || null,
      scheduled_at: scheduledAt || null,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: '작업 생성 실패: ' + (jobErr?.message || '') }, { status: 500 });
  }

  return NextResponse.json({ jobId: job.id, message: '로컬 에이전트 대기 중. npm run naver:publish 실행 필요' });
}
