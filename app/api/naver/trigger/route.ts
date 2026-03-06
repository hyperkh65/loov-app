import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const GITHUB_OWNER = 'hyperkh65';
const GITHUB_REPO = 'loov-app';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content, tags = [], categoryNo = 0, status = 'publish', notionPageId = '' }
    = await req.json() as {
      title: string; content: string; tags: string[];
      categoryNo: number; status: string; notionPageId: string;
    };

  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

  // 연결 정보 확인
  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id) return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다' }, { status: 400 });
  if (!conn.nid_aut || !conn.nid_ses) return NextResponse.json({ error: '네이버 쿠키(NID_AUT, NID_SES)를 설정 탭에서 입력해주세요' }, { status: 400 });

  // 1. 발행 작업 생성
  const { data: job, error: jobErr } = await supabase
    .from('naver_publish_jobs')
    .insert({
      user_id: user.id,
      title: title.trim(),
      content,
      tags,
      category_no: categoryNo,
      is_publish: status === 'publish',
      notion_page_id: notionPageId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: '작업 생성 실패: ' + (jobErr?.message || '') }, { status: 500 });
  }

  // 2. GitHub Actions 트리거 (repository_dispatch)
  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    // PAT 없으면 직접 발행으로 fallback
    return NextResponse.json({ error: 'GITHUB_PAT 환경변수가 없습니다. 직접 발행을 사용하세요.' }, { status: 500 });
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: 'naver-publish',
        client_payload: { job_id: job.id },
      }),
    }
  );

  if (!ghRes.ok) {
    const ghErr = await ghRes.text();
    // 작업은 남겨두고 에러 반환
    await supabase.from('naver_publish_jobs').update({
      status: 'failed', error_message: `GitHub Actions 트리거 실패: ${ghRes.status}`,
    }).eq('id', job.id);
    return NextResponse.json({ error: `GitHub Actions 트리거 실패 (${ghRes.status}): ${ghErr}` }, { status: 500 });
  }

  return NextResponse.json({ jobId: job.id, message: 'GitHub Actions에서 발행을 시작합니다 (약 1~2분 소요)' });
}
