import { NextRequest } from 'next/server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';

const PUB_ID = 'ca-pub-8940400388075870';
const ADMIN_EMAIL = 'admin@aboda.kr';
const WEB_ROOT = '/volume1/web';

function makeAdPlugin(subdomain: string): string {
  return `<?php
/**
 * Plugin Name: Aboda AdSense Optimizer
 * Description: aboda.kr 수익 최적화 AdSense 자동 삽입 (${subdomain}.aboda.kr)
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
  const { subdomain, title, topic, adminPass } = body as {
    subdomain: string; title: string; topic: string; adminPass: string;
  };

  if (!subdomain || !/^[a-z0-9-]{2,30}$/.test(subdomain)) {
    return new Response(JSON.stringify({ error: 'Invalid subdomain' }), { status: 400 });
  }

  const WP_DIR = `${WEB_ROOT}/${subdomain}`;
  const DB_NAME = `wp_${subdomain.replace(/-/g, '_')}`;
  const DB_USER = `wp_${subdomain.replace(/-/g, '_').slice(0, 16)}`;
  const DB_PASS = Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 6);
  const WP_URL = `https://${subdomain}.aboda.kr`;
  const MYSQL_ROOT = process.env.NAS_MYSQL_ROOT_PASS || '';
  const SYNO_PASS = process.env.NAS_SYNO_ADMIN_PASS || process.env.NAS_SSH_PASSWORD || '';
  const WP_CLI = '/volume1/homes/urjent/bin/wp';
  const WP = `php ${WP_CLI} --path=${WP_DIR} --allow-root`;
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
        const r = await nasExec(cmd);
        if (r.stderr) send(r.stderr.slice(0, 300), 'warn');
        if (r.code !== 0 && !allowFail) {
          throw new Error(`[${label}] 실패 (code ${r.code}): ${r.stderr || r.stdout}`);
        }
        return r;
      };

      try {
        // ── 1. 중복 확인
        send('도메인 중복 확인...', 'step');
        const chk = await nasExec(`test -d ${WP_DIR} && echo exists || echo ok`);
        if (chk.stdout.trim() === 'exists') throw new Error(`${subdomain}.aboda.kr 이미 존재합니다`);
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
        const wpCheck = await nasExec(`ls ${WP_CLI} 2>/dev/null && echo installed || echo missing`);
        if (wpCheck.stdout.includes('missing')) {
          await run('WP-CLI 설치 중...',
            `mkdir -p /volume1/homes/urjent/bin && \
             curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o ${WP_CLI} && \
             chmod +x ${WP_CLI} && echo ok`
          );
          send('✅ WP-CLI 설치 완료');
        } else {
          send('✅ WP-CLI 이미 설치됨');
        }

        // ── 4. 데이터베이스 생성
        const mysqlAuth = MYSQL_ROOT ? `-u root -p"${MYSQL_ROOT}"` : `-u root`;
        await run('🗄️ MySQL 데이터베이스 생성...',
          `mysql ${mysqlAuth} -e "
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
            --extra-php="define('WP_DEBUG', false); define('DISALLOW_FILE_EDIT', true); define('WP_POST_REVISIONS', 5);" && echo ok`
        );
        send('✅ wp-config.php 생성 완료');

        // ── 6. WordPress 설치 (core install)
        await run('🚀 WordPress 코어 설치 중...',
          `${WP} core install \
            --url="${WP_URL}" \
            --title="${title.replace(/"/g, '\\"')}" \
            --admin_user="admin" \
            --admin_password="${adminPass}" \
            --admin_email="${ADMIN_EMAIL}" \
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

        // ── 10. 플러그인 설치
        await run('🔌 플러그인 설치 중 (시간이 걸릴 수 있습니다)...',
          `${WP} plugin install \
            advanced-ads \
            rank-math-seo \
            litespeed-cache \
            smush \
            wordfence \
            really-simple-ssl \
            contact-form-7 \
            wp-optimize \
            table-of-contents-plus \
            --activate && \
           ${WP} plugin delete hello akismet 2>/dev/null; \
           echo ok`
        );
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
        const pluginContent = makeAdPlugin(subdomain);
        const mkDir = await nasExec(`mkdir -p ${WP_DIR}/wp-content/mu-plugins && echo ok`);
        if (mkDir.code === 0) {
          await nasExecWithStdin(
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

        // ── 15. Synology WebStation 가상호스트 설정
        send('🌐 WebStation 가상호스트 설정 중...', 'step');
        const synoSid = await nasExec(
          `curl -sk "http://localhost:5000/webapi/entry.cgi?api=SYNO.API.Auth&version=7&method=login&account=urjent&passwd=${encodeURIComponent(SYNO_PASS)}&session=WebStation&format=cookie" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['sid'] if d.get('success') else '')" 2>/dev/null || echo ""`
        );

        if (synoSid.stdout.trim()) {
          const sid = synoSid.stdout.trim();
          const vsResult = await nasExec(
            `curl -sk "http://localhost:5000/webapi/entry.cgi" \
              --cookie "id=${sid}" \
              --data "api=SYNO.WebStation.VirtualHost&version=1&method=create&hostname=${subdomain}.aboda.kr&backend_type=php&port=80,443&root=${WP_DIR}" 2>/dev/null || echo "webstation_failed"`
          );
          if (vsResult.stdout.includes('webstation_failed') || vsResult.code !== 0) {
            send('⚠️ WebStation 자동 설정 실패 — 아래 수동 설정 필요', 'warn');
            send(`WebStation → 가상호스트 추가: 호스트명=${subdomain}.aboda.kr, 루트=${WP_DIR}`, 'warn');
          } else {
            send('✅ WebStation 가상호스트 자동 생성 완료');
          }
        } else {
          send('⚠️ WebStation 로그인 실패 — 수동 설정 필요', 'warn');
          send(`WebStation 앱 → 가상호스트 → 추가: 호스트명=${subdomain}.aboda.kr, 폴더=${WP_DIR}`, 'warn');
        }

        // ── 완료
        send(JSON.stringify({
          url: WP_URL,
          adminUrl: `${WP_URL}/wp-admin/`,
          adminUser: 'admin',
          adminPass,
          domain: `${subdomain}.aboda.kr`,
          dnsNote: `dnszi.com에서 CNAME: ${subdomain} → hy64.synology.me 추가 필요`,
        }), 'done');

      } catch (e) {
        send(String(e), 'error');
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
