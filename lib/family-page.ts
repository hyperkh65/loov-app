/**
 * 2days.kr/family — 패밀리 사이트(운영 중인 워드프레스들) 소개 페이지 자동 생성.
 * 새 사이트가 wp-auto로 만들어질 때마다 wordpress_sites 최신 목록 기준으로
 * 다시 그려서 https://2days.kr 의 "family" 슬러그 페이지를 갱신한다.
 * 로고는 이미지 생성/업로드 없이 사이트명 기반 이니셜+색상 SVG를 그때그때 인라인으로 만든다.
 */
import { createAdminClient } from '@/lib/supabase-server';

const FAMILY_HOST_URL = 'https://2days.kr';
const PALETTE = ['#4F46E5', '#0EA5E9', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2'];

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  // 한글 사이트명은 첫 글자, 영문은 첫 두 글자 이니셜
  const trimmed = name.trim();
  if (/^[a-zA-Z]/.test(trimmed)) {
    return trimmed.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
  return trimmed.slice(0, 1);
}

function generateLogoSvg(name: string, seedKey: string): string {
  const color = PALETTE[hashSeed(seedKey) % PALETTE.length];
  const text = initials(name);
  return `<svg width="72" height="72" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
<rect width="72" height="72" rx="16" fill="${color}"/>
<text x="36" y="36" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${text}</text>
</svg>`;
}

function buildFamilyHtml(sites: { site_name: string; site_url: string }[]): string {
  const cards = sites.map(s => `
    <a href="${s.site_url}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:16px;padding:20px;border:1px solid #e5e7eb;border-radius:16px;text-decoration:none;color:inherit;background:#fff;">
      <span style="flex-shrink:0;">${generateLogoSvg(s.site_name, s.site_url)}</span>
      <span>
        <strong style="display:block;font-size:17px;color:#111;">${s.site_name}</strong>
        <span style="display:block;font-size:13px;color:#6b7280;">${s.site_url.replace(/^https?:\/\//, '')}</span>
      </span>
    </a>`).join('\n');

  return `<!-- wp:html -->
<div style="max-width:880px;margin:0 auto;padding:24px 0;">
  <h1 style="font-size:26px;margin-bottom:8px;">패밀리 사이트</h1>
  <p style="color:#6b7280;margin-bottom:24px;">저희가 함께 운영하는 사이트들을 소개합니다.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
${cards}
  </div>
</div>
<!-- /wp:html -->`;
}

export async function syncFamilyPage(): Promise<void> {
  const supabase = createAdminClient();

  const { data: sites } = await supabase
    .from('wordpress_sites')
    .select('site_name, site_url')
    .eq('user_id', process.env.OWNER_USER_ID!)
    .eq('is_active', true)
    .order('site_name');
  if (!sites || sites.length === 0) return;

  const { data: hostRow } = await supabase
    .from('wordpress_sites')
    .select('wp_username, app_password')
    .eq('site_url', FAMILY_HOST_URL)
    .single();
  if (!hostRow) throw new Error(`${FAMILY_HOST_URL}이 wordpress_sites에 없음`);

  const auth = 'Basic ' + Buffer.from(`${hostRow.wp_username}:${hostRow.app_password}`).toString('base64');
  const content = buildFamilyHtml(sites);

  const existingRes = await fetch(`${FAMILY_HOST_URL}/wp-json/wp/v2/pages?slug=family&status=publish,draft`, {
    headers: { Authorization: auth },
  });
  const existing = existingRes.ok ? await existingRes.json() : [];

  const body = { title: '패밀리 사이트', slug: 'family', status: 'publish', content };

  if (Array.isArray(existing) && existing.length > 0) {
    const res = await fetch(`${FAMILY_HOST_URL}/wp-json/wp/v2/pages/${existing[0].id}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`family 페이지 업데이트 실패: ${(await res.text()).slice(0, 300)}`);
  } else {
    const res = await fetch(`${FAMILY_HOST_URL}/wp-json/wp/v2/pages`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`family 페이지 생성 실패: ${(await res.text()).slice(0, 300)}`);
  }
}
