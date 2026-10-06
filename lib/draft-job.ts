import { createAdminClient } from '@/lib/supabase-server';

// 대시보드 "특정 키워드 직접 생성"과 같은 잡(/api/auto-service/jobs) → 초안 관리에 쌓임.
// 끝나면 notify(메시지)로 알려준다(최대 15분, 15초 간격 — 서버 프로세스가 계속 떠 있어야 함).
export async function startDraftJob(keyword: string, notify: (msg: string) => Promise<unknown>): Promise<string | null> {
  const admin = createAdminClient();
  const { data: st } = await admin.from('bossai_auto_settings').select('ai_model, use_gpt, use_openrouter')
    .eq('user_id', process.env.OWNER_USER_ID!).maybeSingle();
  const ai_model = st?.use_gpt ? 'openai' : st?.use_openrouter ? 'openrouter' : st?.ai_model || 'qwen3.5';

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${base}/api/auto-service/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.TELEGRAM_WEBHOOK_SECRET ?? '', Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    body: JSON.stringify({ keyword, ai_model }),
  });
  const job = await res.json().catch(() => ({})) as { article_id?: string; error?: string };
  if (!res.ok || !job.article_id) return job.error ?? `HTTP ${res.status}`;

  void (async () => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 15_000));
      const { data: a } = await admin.from('bossai_auto_articles').select('status, title, word_count, meta_description').eq('id', job.article_id!).maybeSingle();
      if (a?.status === 'draft') return void notify(`✅ 초안 완성 (${a.word_count}자)\n${a.title}\n\n대시보드 → 블로그 자동화 → 초안 관리에서 확인하세요.`).catch(() => {});
      if (a?.status === 'failed') return void notify(`❌ 생성 실패: ${keyword}\n${a.meta_description ?? ''}`).catch(() => {});
    }
  })();
  return null;
}
