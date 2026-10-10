/**
 * POST /api/wp-auto/verification-tag
 * 네이버 서치어드바이저 같은 곳에서 주는 <meta name="...-site-verification" ...> 태그를
 * 붙여넣으면 해당 사이트의 <head>에 자동으로 심어준다(mu-plugin으로 wp_head에 echo).
 * Google은 Site Verification API로 이미 완전자동(gsc-sync)이라 이건 API가 없는
 * 네이버/빙 등 "메타태그 붙여넣기" 방식 검증용.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: NextRequest) {
  const { siteUrl, tag } = await req.json().catch(() => ({}));
  if (!siteUrl || !tag) return err('siteUrl, tag 필요');

  const trimmed = String(tag).trim();
  if (!/^<meta\b[^>]*>$/i.test(trimmed)) {
    return err('<meta ...> 형태의 태그만 지원합니다. 사이트 인증 서비스에서 제공하는 태그 한 줄을 그대로 붙여넣어 주세요.');
  }

  const supabase = createAdminClient();
  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('nas, subdomain')
    .eq('site_url', siteUrl)
    .eq('user_id', process.env.OWNER_USER_ID!)
    .single();
  if (!site?.subdomain) {
    return err('wp-auto로 만든 사이트만 지원합니다 (등록된 사이트를 못 찾았거나 subdomain 정보가 없음)', 404);
  }

  const target = NAS_TARGETS[(site.nas as NasKey) || 'hy64'];
  const wpDir = `${WEB_ROOT}/${site.subdomain}`;
  const WP = `/usr/local/bin/php82 /volume1/homes/urjent/bin/wp --path=${wpDir} --allow-root`;

  try {
    const existing = await target.exec(`${WP} option get loov_verification_tags --format=json 2>/dev/null`);
    let tags: string[] = [];
    try { tags = JSON.parse(existing.stdout) || []; } catch { tags = []; }
    if (!Array.isArray(tags)) tags = [];
    if (!tags.includes(trimmed)) tags.push(trimmed);

    await target.execWithStdin(`${WP} option update loov_verification_tags --format=json`, JSON.stringify(tags));

    const muPlugin = `<?php
/**
 * Plugin Name: LOOV Site Verification Tags
 * Description: 네이버/빙 등 소유확인용 메타태그를 wp_head에 출력
 */
if (!defined('ABSPATH')) exit;
add_action('wp_head', function () {
    $tags = get_option('loov_verification_tags', []);
    foreach ((array) $tags as $t) {
        echo $t . "\\n";
    }
}, 1);
`;
    await target.exec(`mkdir -p ${wpDir}/wp-content/mu-plugins`);
    await target.execWithStdin(`cat > ${wpDir}/wp-content/mu-plugins/loov-site-verification.php`, muPlugin);

    return NextResponse.json({ ok: true, tagsCount: tags.length });
  } catch (e) {
    return err(`적용 실패: ${String(e).slice(0, 200)}`, 500);
  }
}

export async function GET(req: NextRequest) {
  const siteUrl = new URL(req.url).searchParams.get('siteUrl');
  if (!siteUrl) return err('siteUrl 필요');

  const supabase = createAdminClient();
  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('nas, subdomain')
    .eq('site_url', siteUrl)
    .eq('user_id', process.env.OWNER_USER_ID!)
    .single();
  if (!site?.subdomain) return err('사이트를 찾을 수 없음', 404);

  const target = NAS_TARGETS[(site.nas as NasKey) || 'hy64'];
  const wpDir = `${WEB_ROOT}/${site.subdomain}`;
  const WP = `/usr/local/bin/php82 /volume1/homes/urjent/bin/wp --path=${wpDir} --allow-root`;
  const res = await target.exec(`${WP} option get loov_verification_tags --format=json 2>/dev/null`);
  let tags: string[] = [];
  try { tags = JSON.parse(res.stdout) || []; } catch { tags = []; }
  return NextResponse.json({ ok: true, tags: Array.isArray(tags) ? tags : [] });
}
