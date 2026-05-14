import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { refreshBloggerToken } from '@/lib/blogger-token';
import type { Schedule, ShortsAutoConfig } from './index';

const SCENE_MAP: Record<number, number> = { 30: 5, 60: 9, 120: 16 };

const TONE_LABELS: Record<string, string> = {
  info: '정보형 바이럴', fun: '코믹·밈', emotion: '감동·공감', edu: '교육형', story: '스토리텔링', trend: '트렌드·이슈',
};

async function getWpCredentials(siteId: string): Promise<{ url: string; username: string; appPassword: string }> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('wordpress_sites').select('site_url, wp_username, app_password').eq('id', siteId).single();
  if (!data) throw new Error('등록된 WordPress 사이트를 찾을 수 없습니다');
  return { url: data.site_url, username: data.wp_username, appPassword: data.app_password };
}

async function getBloggerTokenAdmin(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: row } = await supabase.from('bossai_blogger_tokens').select('*').eq('user_id', userId).single();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() > Date.now() + 300000) return row.access_token;
  if (!row.refresh_token) return null;
  const refreshed = await refreshBloggerToken(row.refresh_token);
  if (!refreshed) return null;
  await supabase.from('bossai_blogger_tokens').update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at, updated_at: new Date().toISOString() }).eq('user_id', userId);
  return refreshed.access_token;
}

export async function runShortsAuto(schedule: Schedule): Promise<{ topic: string; title: string; saved: boolean; url: string }> {
  const config = schedule.config as ShortsAutoConfig;
  if (!config.topics?.length) throw new Error('주제가 설정되지 않았습니다');

  const idx = schedule.keyword_index % config.topics.length;
  const topic = config.topic_mode === 'random'
    ? config.topics[Math.floor(Math.random() * config.topics.length)]
    : config.topics[idx];

  const duration = config.duration || 60;
  const numScenes = SCENE_MAP[duration] ?? 9;
  const toneLabel = TONE_LABELS[config.tone] || '정보형 바이럴';

  const prompt = `당신은 대한민국 최고의 숏폼 바이럴 콘텐츠 크리에이터입니다.

주제: "${topic}"
영상 길이: ${duration}초
장면 수: ${numScenes}개
톤: ${toneLabel}
플랫폼: ${config.platform || 'youtube'}

반드시 아래 JSON 형식으로만 출력 (코드블록 없이):
{
  "title": "클릭 유발 제목 (40자 이내)",
  "description": "SEO 설명 2~3줄",
  "hook": "썸네일 문구 (15자 이내)",
  "scenes": [
    {"id": 1, "duration": 5, "narration": "나레이션 텍스트", "visual": "화면 묘사", "caption": "자막"}
  ]
}`;

  const aiText = await generateText(prompt, 'qwen3');

  // JSON 파싱
  let parsed: { title?: string; description?: string; hook?: string; scenes?: unknown[] } = {};
  try {
    const cleaned = aiText.replace(/```[\w]*\n?/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m?.[0] || cleaned);
  } catch { /* AI 출력 파싱 실패 */ }

  const title = parsed.title || `${topic} 숏폼 스크립트`;
  const scenes = parsed.scenes || [];

  let savedUrl = '';

  // 블로그에 스크립트 저장 (optional)
  if (config.save_to_blog && scenes.length > 0) {
    const scriptHtml = `<h2>${title}</h2>
<p><strong>훅:</strong> ${parsed.hook || ''}</p>
<p>${parsed.description || ''}</p>
<hr/>
${(scenes as Array<{ id?: number; duration?: number; narration?: string; visual?: string; caption?: string }>).map(s => `
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0">
  <p><strong>장면 ${s.id || ''}</strong> (${s.duration || 0}초)</p>
  <p>🎙️ <strong>나레이션:</strong> ${s.narration || ''}</p>
  <p>📹 <strong>화면:</strong> ${s.visual || ''}</p>
  <p>📝 <strong>자막:</strong> ${s.caption || ''}</p>
</div>`).join('\n')}
<p style="color:#6b7280;font-size:13px">자동 생성: ${new Date().toLocaleDateString('ko-KR')}</p>`;

    let publishedUrl = '';
    try {
      if (config.blog_platform === 'blogger') {
        const token = await getBloggerTokenAdmin(schedule.user_id);
        if (token) {
          const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${config.blogger_blog_id || '7951763866955162015'}/posts`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content: scriptHtml, labels: ['숏폼', '스크립트', topic], kind: 'blogger#post' }),
          });
          if (res.ok) { const d = await res.json(); publishedUrl = d.url || d.id || ''; }
        }
      } else if (config.blog_platform === 'wordpress') {
        let wpUrl = '', wpUser = '', wpPass = '';
        if (config.wp_site_id) {
          const c = await getWpCredentials(config.wp_site_id);
          wpUrl = c.url; wpUser = c.username; wpPass = c.appPassword;
        } else if (config.wp_url && config.wp_username && config.wp_app_password) {
          wpUrl = config.wp_url; wpUser = config.wp_username; wpPass = config.wp_app_password;
        }
        if (wpUrl) {
          const creds = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
          const res = await fetch(`${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content: scriptHtml, status: 'publish' }),
          });
          if (res.ok) { const d = await res.json(); publishedUrl = d.link || ''; }
        }
      }
    } catch { /* 블로그 발행 실패 무시 */ }
    if (publishedUrl) savedUrl = publishedUrl;
  }

  // 주제 인덱스 업데이트
  if (config.topic_mode === 'rotate') {
    const supabase = createAdminClient();
    await supabase.from('bossai_schedules').update({ keyword_index: (idx + 1) % config.topics.length }).eq('id', schedule.id);
  }

  return { topic, title, saved: config.save_to_blog && scenes.length > 0, url: savedUrl };
}
