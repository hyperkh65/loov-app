import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';

const PUB_ID = 'ca-pub-8940400388075870';
// 사이트마다 admin 계정을 따로 관리하기 번거로워서 고정 계정으로 통일 —
// 아이디도 흔한 "admin" 대신 urjent로 둬서 자동화 봇의 기본 무차별 대입 표적을 피함
const ADMIN_USER = 'urjent';
const ADMIN_PASS = 'Aa050677##';

function makeAdPlugin(fqdn: string): string {
  return `<?php
/**
 * Plugin Name: Aboda AdSense Optimizer
 * Description: 수익 최적화 AdSense 자동 삽입 (${fqdn})
 * Version: 1.0
 * Author: LOOV System
 */

if (!defined('ABSPATH')) exit;

// ── Auto Ads 스크립트 (헤더)
add_action('wp_head', function() {
    echo '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUB_ID}" crossorigin="anonymous"></script>' . "\\n";
}, 1);

// ── 본문 최상단 광고 (아보다 신형 9071434254)
add_filter('the_content', function($content) {
    if (!is_singular()) return $content;
    $ad = '<div class="loov-ad" style="margin:20px auto 16px;text-align:center;clear:both;">
<ins class="adsbygoogle" style="display:block" data-ad-client="${PUB_ID}" data-ad-slot="9071434254" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>';
    return $ad . $content;
}, 10);

// ── 두 번째 단락 뒤 광고 (아보다_5 4238744126)
add_filter('the_content', function($content) {
    if (!is_singular()) return $content;
    $parts = explode('</p>', $content);
    if (count($parts) < 4) return $content;
    $ad = '<div class="loov-ad" style="margin:16px auto;text-align:center;clear:both;">
<ins class="adsbygoogle" style="display:block" data-ad-client="${PUB_ID}" data-ad-slot="4238744126" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>';
    $parts[2] .= '</p>' . $ad;
    array_splice($parts, 3, 0, ['']);
    return implode('</p>', $parts);
}, 15);

// ── 본문 최하단 광고 (아보다_신형2 7354479161)
add_filter('the_content', function($content) {
    if (!is_singular()) return $content;
    $ad = '<div class="loov-ad" style="margin:16px auto 20px;text-align:center;clear:both;">
<ins class="adsbygoogle" style="display:block" data-ad-client="${PUB_ID}" data-ad-slot="7354479161" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>';
    return $content . $ad;
}, 20);

// ── 게시물 루프 사이 광고 (아보다_4 1739739148) - 3번째 글마다
add_action('loop_end', function($wp_query) {
    static $count = 0;
    $count++;
    if ($count % 3 !== 0 || is_single()) return;
    echo '<div class="loov-ad" style="margin:16px auto;text-align:center;clear:both;">
<ins class="adsbygoogle" style="display:block" data-ad-client="${PUB_ID}" data-ad-slot="1739739148" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>';
});

// ── GeneratePress 사이드바 위젯 광고 (아보다_5)
add_action('generate_before_right_sidebar_content', function() {
    echo '<div class="loov-ad widget" style="margin-bottom:20px;text-align:center;">
<ins class="adsbygoogle" style="display:block" data-ad-client="${PUB_ID}" data-ad-slot="4238744126" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>';
});

// ── 광고 CSS
add_action('wp_head', function() {
    echo '<style>
.loov-ad { max-width:100%; overflow:hidden; }
.loov-ad ins { min-width:250px; }
@media(max-width:768px) { .loov-ad { margin:12px auto !important; } }
</style>';
});
`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { subdomain, title, topic, nas } = body as {
    subdomain: string; title: string; topic: string; nas?: NasKey;
  };

  if (!subdomain || !/^[a-z0-9-]{2,30}$/.test(subdomain)) {
    return new Response(JSON.stringify({ error: 'Invalid subdomain' }), { status: 400 });
  }

  const target = NAS_TARGETS[nas || 'hy64'];
  const nasExecFn = target.exec;

  const WP_DIR = `${WEB_ROOT}/${subdomain}`;
  const DB_NAME = `wp_${subdomain.replace(/-/g, '_')}`;
  const DB_USER = `wp_${subdomain.replace(/-/g, '_').slice(0, 16)}`;
  const DB_PASS = (() => {
    // MariaDB validate_password 정책(길이10+/대소문자/숫자/특수문자 모두 포함)을
    // 확률에 맡기면 가끔 소문자가 하나도 안 뽑혀서 실사용 중 DB 생성이 실패하는 게
    // 확인됨 — 클래스별 최소 1개씩 강제로 넣고 섞음
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%^&*';
    const all = lower + upper + digits + special;
    const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
    const chars = [rand(lower), rand(upper), rand(digits), rand(special)];
    while (chars.length < 14) chars.push(rand(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  })();
  const WP_URL = `https://${subdomain}.${target.domainSuffix}`;
  const MYSQL_ROOT = target.mysqlRootPass;
  const WP_CLI = '/volume1/homes/urjent/bin/wp';
  const WP = `/usr/local/bin/php82 ${WP_CLI} --path=${WP_DIR} --allow-root`;
  const MYSQL_BIN = '/usr/local/bin/mysql';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string, type: 'step' | 'log' | 'done' | 'error' | 'warn' = 'log') => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, msg })}\n\n`));
        } catch { /* closed */ }
      };

      const run = async (label: string, cmd: string, allowFail = false) => {
        send(label, 'step');
        const r = await nasExecFn(cmd);
        if (r.stderr) send(r.stderr.slice(0, 300), 'warn');
        if (r.code !== 0 && !allowFail) {
          throw new Error(`[${label}] 실패 (code ${r.code}): ${r.stderr || r.stdout}`);
        }
        return r;
      };

      try {
        // ── 1. 중복 확인
        send('도메인 중복 확인...', 'step');
        const chk = await nasExecFn(`test -d ${WP_DIR} && echo exists || echo ok`);
        if (chk.stdout.trim() === 'exists') throw new Error(`${subdomain}.${target.domainSuffix} 이미 존재합니다`);
        send('✅ 도메인 사용 가능');

        // ── 2. 디렉토리 + WordPress 다운로드
        await run('📁 디렉토리 생성 및 WordPress 다운로드...',
          `mkdir -p ${WP_DIR} && \
           cd /tmp && \
           curl -sL https://wordpress.org/latest.tar.gz -o /tmp/wp_${subdomain}.tar.gz && \
           tar -xzf /tmp/wp_${subdomain}.tar.gz && \
           cp -r /tmp/wordpress/. ${WP_DIR}/ && \
           rm -rf /tmp/wordpress /tmp/wp_${subdomain}.tar.gz && \
           echo ok`
        );
        send('✅ WordPress 파일 설치 완료');

        // ── 3. WP-CLI 확인/설치 (홈 디렉토리에 설치)
        send('🔧 WP-CLI 확인...', 'step');
        const wpCheck = await nasExecFn(`ls ${WP_CLI} 2>/dev/null && echo installed || echo missing`);
        if (wpCheck.stdout.includes('missing')) {
          await run('WP-CLI 설치 중...',
            `mkdir -p /volume1/homes/urjent/bin && \
             curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o ${WP_CLI} && \
             chmod +x ${WP_CLI} && /usr/local/bin/php82 ${WP_CLI} --version && echo ok`
          );
          send('✅ WP-CLI 설치 완료');
        } else {
          send('✅ WP-CLI 이미 설치됨');
        }

        // ── 4. 데이터베이스 생성
        const mysqlAuth = MYSQL_ROOT ? `-u root -p"${MYSQL_ROOT}"` : `-u root`;
        await run('🗄️ MySQL 데이터베이스 생성...',
          `${MYSQL_BIN} ${mysqlAuth} -e "
            CREATE DATABASE IF NOT EXISTS \\\`${DB_NAME}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            DROP USER IF EXISTS '${DB_USER}'@'localhost';
            CREATE USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
            GRANT ALL PRIVILEGES ON \\\`${DB_NAME}\\\`.* TO '${DB_USER}'@'localhost';
            FLUSH PRIVILEGES;" && echo ok`
        );
        send(`✅ DB 생성: ${DB_NAME}`);

        // ── 5. wp-config.php 생성
        await run('⚙️ WordPress 설정 파일 생성...',
          `${WP} config create \
            --dbname="${DB_NAME}" \
            --dbuser="${DB_USER}" \
            --dbpass="${DB_PASS}" \
            --dbhost="localhost" \
            --locale=ko_KR \
            --force \
            --extra-php="\\$_SERVER['HTTPS']='on'; \\$_SERVER['SERVER_PORT']='443'; define('WP_DEBUG', false); define('DISALLOW_FILE_EDIT', true); define('WP_POST_REVISIONS', 5); define('FORCE_SSL_ADMIN', true);" && echo ok`
        );
        send('✅ wp-config.php 생성 완료');

        // ── 6. WordPress 설치 (core install)
        await run('🚀 WordPress 코어 설치 중...',
          `${WP} core install \
            --url="${WP_URL}" \
            --title="${title.replace(/"/g, '\\"')}" \
            --admin_user="${ADMIN_USER}" \
            --admin_password="${ADMIN_PASS}" \
            --admin_email="${target.adminEmail}" \
            --skip-email && echo ok`
        );
        send('✅ WordPress 코어 설치 완료');

        // ── 7. 언어 + 기본 설정
        await run('🌐 한국어 설정 중...',
          `${WP} core language install ko_KR --activate && \
           ${WP} option update timezone_string "Asia/Seoul" && \
           ${WP} option update date_format "Y년 n월 j일" && \
           ${WP} option update time_format "a g:i" && \
           ${WP} option update start_of_week 1 && \
           ${WP} option update blogdescription "${topic} 정보 블로그" && \
           ${WP} option update permalink_structure "/%postname%/" && \
           ${WP} option update default_comment_status "closed" && \
           ${WP} option update default_ping_status "closed" && \
           ${WP} option update blog_public 1 && \
           ${WP} rewrite flush && \
           echo ok`
        );
        send('✅ 한국어 및 기본 설정 완료');

        // ── 8. 샘플 콘텐츠 삭제
        await run('🧹 샘플 콘텐츠 삭제...',
          `${WP} post delete 1 2 --force 2>/dev/null; \
           ${WP} comment delete 1 --force 2>/dev/null; \
           echo ok`,
          true
        );

        // ── 9. GeneratePress 테마 설치
        await run('🎨 GeneratePress 테마 설치 중...',
          `${WP} theme install generatepress --activate && \
           ${WP} theme delete twentytwenty twentytwentyone twentytwentytwo twentytwentythree twentytwentyfour 2>/dev/null; \
           echo ok`
        );
        send('✅ GeneratePress 테마 설치 완료');

        // ── 10. 플러그인 설치 (하나씩 설치 - 실패해도 계속 진행)
        const plugins = [
          'litespeed-cache',       // 속도(캐시) — 별도 속도 플러그인 추가하면 캐시끼리 충돌해서 이거 하나만 씀
          'seo-by-rank-math',      // SEO (Rank Math)
          'really-simple-ssl',     // HTTPS
          'advanced-ads',          // AdSense
          'wp-smushit',            // 이미지 최적화
          'auto-post-thumbnail',   // 대표이미지 미설정 시 본문 첫 이미지를 자동으로 대표이미지로 지정
          'wp-google-maps',        // 구글맵 삽입(WP Go Maps)
        ];
        for (const plugin of plugins) {
          send(`🔌 플러그인 설치: ${plugin}`, 'step');
          const pr = await nasExecFn(`${WP} plugin install ${plugin} --activate 2>&1 && echo ok`);
          if (pr.stdout.includes('ok') || pr.stdout.includes('Success')) {
            send(`✅ ${plugin}`);
          } else {
            send(`⚠️ ${plugin} 설치 실패 (건너뜀): ${pr.stdout.slice(0, 100)}`, 'warn');
          }
        }
        await nasExecFn(`${WP} plugin delete hello akismet 2>/dev/null`);
        send('✅ 플러그인 설치 완료');

        // ── 11. Rank Math SEO 기본 설정
        await run('📈 SEO 설정 중...',
          `${WP} option update rank_math_general_settings '{"strip_category_base":"1","attachment_redirect_urls":"1"}' --format=json 2>/dev/null; \
           echo ok`,
          true
        );

        // ── 12. LiteSpeed Cache 설정 (속도 최적화)
        await run('⚡ 캐시/속도 최적화 설정 중...',
          `${WP} option update litespeed_conf '{"cache-browser":"1","optm-js_defer":"1","optm-css_async":"1","optm-html_minify":"1","optm-js_minify":"1","optm-css_minify":"1","img-lazy":"1","optm-qs_rm":"1"}' --format=json 2>/dev/null; \
           echo ok`,
          true
        );
        send('✅ 캐시/속도 최적화 완료');

        // ── 13. AdSense MU 플러그인 삽입
        send('💰 AdSense 수익화 설정 중...', 'step');
        const pluginContent = makeAdPlugin(`${subdomain}.${target.domainSuffix}`);
        const mkDir = await nasExecFn(`mkdir -p ${WP_DIR}/wp-content/mu-plugins && echo ok`);
        if (mkDir.code === 0) {
          await target.execWithStdin(
            `cat > ${WP_DIR}/wp-content/mu-plugins/aboda-adsense.php`,
            pluginContent
          );
          send('✅ AdSense 자동 삽입 플러그인 설치 완료 (Auto Ads + 전략 위치 4곳)');
        }

        // ── 14. GeneratePress 추가 CSS (속도 + 가독성)
        await run('🎨 테마 최적화 CSS 설정...',
          `${WP} option update custom_css \
            "body{font-size:17px;line-height:1.7;color:#333}
            .entry-content{max-width:800px}
            .wp-block-image img{max-width:100%;height:auto}
            .loov-ad{margin:20px auto!important}" 2>/dev/null; \
           echo ok`,
          true
        );

        // ── 15. ads.txt 등록 (AdSense가 이 파일 없으면 자동광고 승인/노출을 안 함)
        await run('💵 ads.txt 등록 중...',
          `echo "google.com, ${PUB_ID}, DIRECT, f08c47fec0942fa0" > ${WP_DIR}/ads.txt && echo ok`,
          true
        );
        send('✅ ads.txt 등록 완료');

        // ── 16. 앱 비밀번호 발급 + 기존 자동발행 파이프라인(wordpress_sites)에 등록
        // → 이 사이트도 곧바로 리라이팅 자동발행 로테이션에 포함됨(SNS 계정들과 동일한 개념)
        send('🔗 자동발행 파이프라인에 등록 중...', 'step');
        const appPassResult = await nasExecFn(
          `${WP} user application-password create ${ADMIN_USER} "loov-auto" --porcelain 2>/dev/null`
        );
        const appPassword = appPassResult.stdout.trim();
        const sitemapUrl = `${WP_URL}/sitemap_index.xml`;
        if (appPassword && appPassResult.code === 0) {
          try {
            const supabase = createAdminClient();
            await supabase.from('wordpress_sites').insert({
              user_id: process.env.OWNER_USER_ID!,
              site_name: title,
              site_url: WP_URL,
              wp_username: ADMIN_USER,
              app_password: appPassword,
              nas: nas || 'hy64',
              subdomain,
              sitemap_url: sitemapUrl,
              gsc_status: 'pending',
            });
            send('✅ 자동발행 대상으로 등록 완료 (다음 리라이팅 글부터 이 사이트에도 자동 발행)');

            send('🏠 패밀리 페이지(2days.kr/family) 갱신 중...', 'step');
            try {
              const { syncFamilyPage } = await import('@/lib/family-page');
              await syncFamilyPage();
              send('✅ 패밀리 페이지에 새 사이트 추가 완료');
            } catch (e) {
              send(`⚠️ 패밀리 페이지 갱신 실패(수동 확인 필요): ${String(e).slice(0, 150)}`, 'warn');
            }
          } catch (e) {
            send(`⚠️ 자동발행 등록 실패(수동으로 워드프레스 사이트 설정에서 추가 가능): ${String(e).slice(0, 150)}`, 'warn');
          }
        } else {
          send('⚠️ 앱 비밀번호 발급 실패 — 자동발행 등록은 건너뜀 (수동 추가 가능)', 'warn');
        }

        // ── 17. WebStation 수동 설정 안내 (자동화 불가 - nginx reload root 권한 필요)
        send('📋 WebStation 가상호스트 수동 설정 필요 (30초)', 'step');
        send(`① DSM → WebStation → 가상호스트 → 만들기`, 'warn');
        send(`② 호스트명: ${subdomain}.${target.domainSuffix}`, 'warn');
        send(`③ 문서 루트: ${WP_DIR}`, 'warn');
        send(`④ PHP: PHP 8.2 / HTTP+HTTPS(80,443) — Let's Encrypt 자동발급 체크박스도 함께 선택`, 'warn');

        // ── 18. 검색엔진 등록 안내 — Google은 사이트가 실제로 열리는 즉시(가상호스트+DNS
        // 연결 후) gsc-sync 크론이 자동으로 등록+사이트맵 제출까지 해줌. 네이버는
        // 공개 API가 없어 서치어드바이저에 수동 등록 필요.
        send('🔍 검색엔진 등록', 'step');
        send(`Google: 별도 작업 불필요 — 가상호스트+DNS 연결 끝나서 사이트가 열리면 자동으로 Search Console 등록 + 사이트맵 제출됨`, 'log');
        send(`Naver: searchadvisor.naver.com 에서 수동 등록 필요 (공식 API 미제공) → 사이트: ${WP_URL} / 사이트맵: ${sitemapUrl}`, 'warn');

        // ── 완료
        send(JSON.stringify({
          url: WP_URL,
          adminUrl: `${WP_URL}/wp-admin/`,
          adminUser: ADMIN_USER,
          adminPass: ADMIN_PASS,
          domain: `${subdomain}.${target.domainSuffix}`,
          sitemapUrl,
          dnsNote: `dnszi.com에서 CNAME: ${subdomain} → ${target.ddnsHost} 추가 필요`,
          webstationNote: `DSM → WebStation → 가상호스트 → 만들기 → 호스트명: ${subdomain}.${target.domainSuffix} / 루트: ${WP_DIR} / PHP 8.2 (Let's Encrypt 자동발급 체크박스 함께 선택)`,
          searchEngineNote: `Google은 사이트가 열리면 자동 등록됩니다. 네이버는 수동 등록 필요:`,
          naverAdvisorUrl: 'https://searchadvisor.naver.com/',
        }), 'done');

      } catch (e) {
        send(String(e), 'error');
        // 실패 시 자동 롤백
        send('🧹 실패 — 생성된 파일/DB 정리 중...', 'warn');
        await nasExecFn(`rm -rf ${WP_DIR}`).catch(() => {});
        await nasExecFn(`${MYSQL_BIN} -u root -p"${MYSQL_ROOT}" -e "DROP DATABASE IF EXISTS \\\`${DB_NAME}\\\`; DROP USER IF EXISTS '${DB_USER}'@'localhost';" 2>/dev/null`).catch(() => {});
        send('🧹 정리 완료 — 다시 시도할 수 있습니다', 'warn');
      } finally {
        try { controller.close(); } catch { /* ok */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
