import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { createJobToken } from '@/lib/internal-job-auth';

export const maxDuration = 10;

// POST: 백그라운드 글 생성 잡 시작
// 즉시 article_id 반환 → 실제 생성은 서버 백그라운드에서 계속 실행
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    keyword: string;
    ai_model?: string;
    clientOllamaKey?: string;
    clientOpenrouterKey?: string;
    clientGlobalAIKey?: string;
    clientGlobalAIModel?: string;
  };

  const { keyword } = body;
  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  const admin = createAdminClient();

  // 1. DB에 placeholder 행 삽입 (status: 'generating')
  const { data: placeholder, error: insertErr } = await admin
    .from('bossai_auto_articles')
    .insert({
      user_id: user.id,
      keyword,
      focus_keyword: keyword,
      title: `⏳ 생성 중… (${keyword})`,
      meta_description: '',
      content: '',
      status: 'generating',
      ai_model: body.ai_model || 'qwen3',
      word_count: 0,
      sources: [],
    })
    .select('id')
    .single();

  if (insertErr || !placeholder) {
    return NextResponse.json({ error: insertErr?.message || 'DB 삽입 실패' }, { status: 500 });
  }

  const articleId = placeholder.id;

  // 2. 1회용 인증 토큰 발급
  const jobToken = createJobToken(user.id);

  // 3. 백그라운드에서 실제 생성 실행 (await 없이 → 페이지 이탈해도 계속 실행)
  // Docker 환경에서 HOSTNAME이 컨테이너 ID로 설정되므로 localhost 대신 사용
  const internalBase = `http://${process.env.HOSTNAME || 'localhost'}:${process.env.PORT || '3000'}`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || internalBase;
  void fetch(`${baseUrl}/api/auto-service/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      article_id: articleId,
      _job_token: jobToken,
    }),
    // signal 없음 → 서버가 자체적으로 완료
  }).then(async (res) => {
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      console.error(`[jobs] generate failed for ${articleId}:`, errText);
      let errMsg = '';
      try { errMsg = JSON.parse(errText)?.error || errText; } catch { errMsg = errText; }
      await admin.from('bossai_auto_articles')
        .update({
          status: 'failed',
          title: `❌ 생성 실패 (${keyword})`,
          meta_description: errMsg.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq('id', articleId);
    }
  }).catch(async (err) => {
    console.error(`[jobs] generate error for ${articleId}:`, err);
    await admin.from('bossai_auto_articles')
      .update({
        status: 'failed',
        title: `❌ 생성 실패 (${keyword})`,
        meta_description: String(err).slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq('id', articleId);
  });

  // 4. 즉시 응답 반환
  return NextResponse.json({ article_id: articleId, status: 'generating' });
}

// GET: 현재 생성 중인 잡 목록 (15분 이상 stuck → 자동 실패 처리)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = createAdminClient();
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // 15분 이상 generating 상태인 ⏳ placeholder 잡 → 실패로 자동 처리
  await admin.from('bossai_auto_articles')
    .update({
      status: 'failed',
      meta_description: 'AI 응답 시간 초과 (15분) — 다시 시도해주세요.',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('status', 'generating')
    .lt('created_at', staleThreshold)
    .like('title', '⏳%');

  const { data } = await supabase
    .from('bossai_auto_articles')
    .select('id, keyword, title, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'generating')
    .order('created_at', { ascending: false });

  return NextResponse.json({ jobs: data || [] });
}
