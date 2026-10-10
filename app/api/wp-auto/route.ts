import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import crypto from 'crypto';

export const maxDuration = 300;

// AdSense mu-plugin PHP content
const ADSENSE_PHP = `<?php
/**
 * Plugin Name: AdSense Auto Ads
 * Description: Google AdSense auto ads + inline ads
 */

// AdSense Auto Ads main script
add_action('wp_head', function() {
    echo '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8940400388075870" crossorigin="anonymous"></script>' . "\\n";
}, 1);

// Insert ad after 1st paragraph in single posts
add_filter('the_content', function($content) {
    if (!is_singular() || is_admin() || is_feed()) return $content;
    $ad = '<div class="wp-ad-inline" style="margin:20px auto;text-align:center;clear:both;">'
        . '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-8940400388075870" data-ad-slot="6103938601" data-ad-format="auto" data-full-width-responsive="true"></ins>'
        . '<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>'
        . '</div>';
    $paras = explode('</p>', $content);
    if (count($paras) >= 3) {
        array_splice($paras, 1, 0, [$ad]);
    } else {
        $paras[] = $ad;
    }
    return implode('</p>', $paras);
});

// Footer ad before </body>
add_action('wp_footer', function() {
    if (!is_singular()) return;
    echo '<div style="margin:30px auto;text-align:center;max-width:970px;padding:0 15px;">'
        . '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-8940400388075870" data-ad-slot="4238744126" data-ad-format="auto" data-full-width-responsive="true"></ins>'
        . '<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>'
        . '</div>' . "\\n";
});
`;

function generateRandomPassword(length = 16): string {
  return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, length);
}

function buildSetupScript(params: {
  subdomain: string;
  siteName: string;
  siteDesc: string;
  topic: string;
  adminEmail: string;
  adminPassword: string;
  mysqlPassword: string;
  dbName: string;
  dbUser: string;
  dbPass: string;
  jobId: string;
  adsenseBase64: string;
}): string {
  const {
    subdomain, siteName, siteDesc, topic, adminEmail, adminPassword,
    mysqlPassword, dbName, dbUser, dbPass, jobId, adsenseBase64
  } = params;

  const siteUrl = `http://${subdomain}.aboda.kr`;
  const webDir = `/volume1/web/${subdomain}`;
  const logDir = '/volume1/web/.wp-setup-logs';
  const logFile = `${logDir}/${jobId}.log`;

  // MySQL command prefix (handle empty password)
  const mysqlCmd = mysqlPassword
    ? `mysql -u root -p"${mysqlPassword}"`
    : `mysql -u root`;

  return `#!/bin/bash
set -e

SUBDOMAIN="${subdomain}"
SITENAME="${siteName.replace(/"/g, '\\"')}"
SITEDESC="${siteDesc.replace(/"/g, '\\"')}"
TOPIC="${topic.replace(/"/g, '\\"')}"
ADMIN_EMAIL="${adminEmail}"
ADMIN_PASS="${adminPassword.replace(/"/g, '\\"')}"
DB_NAME="${dbName}"
DB_USER="${dbUser}"
DB_PASS="${dbPass}"
SITEURL="${siteUrl}"
WEB="${webDir}"
LOG="${logFile}"
ADSENSE_B64="${adsenseBase64}"

mkdir -p "${logDir}"
echo "[INFO] WordPress 자동 설치 시작: $SUBDOMAIN" >> "$LOG"
echo "[INFO] 시작 시간: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"

# STEP 1: 디렉토리 생성
echo "[STEP:mkdir] 웹 디렉토리 생성 중..." >> "$LOG"
if mkdir -p "$WEB" 2>> "$LOG"; then
  chmod 755 "$WEB" 2>> "$LOG" || true
  echo "[STEP:mkdir:OK] 디렉토리 생성 완료: $WEB" >> "$LOG"
else
  echo "[STEP:mkdir:ERROR] 디렉토리 생성 실패" >> "$LOG"
  echo "[DONE:ERROR] 디렉토리 생성 실패로 중단" >> "$LOG"
  exit 1
fi

# STEP 2: MySQL 데이터베이스 및 사용자 생성
echo "[STEP:db] MySQL 데이터베이스 생성 중..." >> "$LOG"
${mysqlCmd} -e "CREATE DATABASE IF NOT EXISTS \\\`$DB_NAME\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>> "$LOG"
if [ $? -ne 0 ]; then
  echo "[STEP:db:ERROR] 데이터베이스 생성 실패" >> "$LOG"
  echo "[DONE:ERROR] DB 생성 실패로 중단" >> "$LOG"
  exit 1
fi
${mysqlCmd} -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';" 2>> "$LOG" || true
${mysqlCmd} -e "GRANT ALL PRIVILEGES ON \\\`$DB_NAME\\\`.* TO '$DB_USER'@'localhost';" 2>> "$LOG"
${mysqlCmd} -e "FLUSH PRIVILEGES;" 2>> "$LOG"
echo "[STEP:db:OK] DB 생성 완료: $DB_NAME / 사용자: $DB_USER" >> "$LOG"

# STEP 3: WordPress 다운로드
echo "[STEP:download] WordPress 다운로드 중..." >> "$LOG"
WP_TMP="/tmp/wp_${subdomain}_latest.tar.gz"
if wget -q https://wordpress.org/latest.tar.gz -O "$WP_TMP" 2>> "$LOG"; then
  echo "[INFO] 압축 해제 중..." >> "$LOG"
  tar -xzf "$WP_TMP" -C /tmp/ 2>> "$LOG"
  cp -r /tmp/wordpress/. "$WEB/" 2>> "$LOG"
  rm -f "$WP_TMP" 2>> "$LOG" || true
  rm -rf /tmp/wordpress 2>> "$LOG" || true
  echo "[STEP:download:OK] WordPress 다운로드 및 압축 해제 완료" >> "$LOG"
else
  echo "[STEP:download:ERROR] WordPress 다운로드 실패" >> "$LOG"
  echo "[DONE:ERROR] 다운로드 실패로 중단" >> "$LOG"
  exit 1
fi

# STEP 4: WP-CLI 설치 확인 및 설치
echo "[STEP:wpcli] WP-CLI 확인 중..." >> "$LOG"
if ! command -v wp &> /dev/null; then
  echo "[INFO] WP-CLI 설치 중..." >> "$LOG"
  if wget -q https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -O /tmp/wp-cli.phar 2>> "$LOG"; then
    chmod +x /tmp/wp-cli.phar 2>> "$LOG"
    mv /tmp/wp-cli.phar /usr/local/bin/wp 2>> "$LOG"
    echo "[STEP:wpcli:OK] WP-CLI 설치 완료" >> "$LOG"
  else
    echo "[STEP:wpcli:ERROR] WP-CLI 다운로드 실패 — wget 재시도" >> "$LOG"
    curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp 2>> "$LOG" || {
      echo "[STEP:wpcli:ERROR] WP-CLI 설치 실패 (wget/curl 모두 실패)" >> "$LOG"
      echo "[DONE:ERROR] WP-CLI 설치 실패" >> "$LOG"
      exit 1
    }
    chmod +x /usr/local/bin/wp 2>> "$LOG"
    echo "[STEP:wpcli:OK] WP-CLI curl로 설치 완료" >> "$LOG"
  fi
else
  echo "[STEP:wpcli:OK] WP-CLI 이미 설치됨: $(wp --version --allow-root 2>/dev/null || echo 'unknown')" >> "$LOG"
fi

# STEP 5: wp-config.php 생성
echo "[STEP:config] WordPress 설정 파일 생성 중..." >> "$LOG"
if wp config create \
  --dbname="$DB_NAME" \
  --dbuser="$DB_USER" \
  --dbpass="$DB_PASS" \
  --dbhost=localhost \
  --dbcharset=utf8mb4 \
  --path="$WEB" \
  --allow-root \
  --force 2>> "$LOG"; then
  echo "[STEP:config:OK] wp-config.php 생성 완료" >> "$LOG"
else
  echo "[STEP:config:ERROR] wp-config.php 생성 실패" >> "$LOG"
  echo "[DONE:ERROR] 설정 파일 생성 실패" >> "$LOG"
  exit 1
fi

# STEP 6: WordPress 코어 설치
echo "[STEP:install] WordPress 설치 중..." >> "$LOG"
if wp core install \
  --url="$SITEURL" \
  --title="$SITENAME" \
  --admin_user=admin \
  --admin_password="$ADMIN_PASS" \
  --admin_email="$ADMIN_EMAIL" \
  --skip-email \
  --path="$WEB" \
  --allow-root 2>> "$LOG"; then
  echo "[STEP:install:OK] WordPress 설치 완료" >> "$LOG"
else
  echo "[STEP:install:ERROR] WordPress 설치 실패" >> "$LOG"
  echo "[DONE:ERROR] 설치 실패" >> "$LOG"
  exit 1
fi

# STEP 7: GeneratePress 테마 설치
echo "[STEP:theme] GeneratePress 테마 설치 중..." >> "$LOG"
if wp theme install generatepress --activate \
  --path="$WEB" \
  --allow-root 2>> "$LOG"; then
  echo "[STEP:theme:OK] GeneratePress 테마 설치 및 활성화 완료" >> "$LOG"
else
  echo "[STEP:theme:ERROR] 테마 설치 실패 (계속 진행)" >> "$LOG"
fi

# STEP 8: 플러그인 설치 및 활성화
echo "[STEP:plugins] 플러그인 설치 중 (13개)..." >> "$LOG"
wp plugin install \
  amp \
  ad-inserter \
  advanced-editor-tools \
  easy-table-of-contents \
  ewww-image-optimizer \
  featured-image-from-url \
  generateblocks \
  gp-premium \
  rank-math-seo \
  google-site-kit \
  url-shortify \
  wp-fastest-cache \
  yet-another-related-posts-plugin \
  --activate \
  --path="$WEB" \
  --allow-root 2>> "$LOG"
PLUGIN_STATUS=$?
if [ $PLUGIN_STATUS -eq 0 ]; then
  echo "[STEP:plugins:OK] 플러그인 설치 완료" >> "$LOG"
else
  echo "[STEP:plugins:ERROR] 일부 플러그인 설치 실패 (계속 진행)" >> "$LOG"
fi

# STEP 9: AdSense mu-plugin 설치
echo "[STEP:adsense] AdSense mu-plugin 설치 중..." >> "$LOG"
mkdir -p "$WEB/wp-content/mu-plugins" 2>> "$LOG"
echo "$ADSENSE_B64" | base64 -d > "$WEB/wp-content/mu-plugins/adsense-auto.php" 2>> "$LOG"
if [ $? -eq 0 ]; then
  echo "[STEP:adsense:OK] AdSense mu-plugin 설치 완료 (ca-pub-8940400388075870)" >> "$LOG"
else
  echo "[STEP:adsense:ERROR] AdSense mu-plugin 설치 실패 (계속 진행)" >> "$LOG"
fi

# STEP 10: 기본 설정
echo "[STEP:settings] WordPress 기본 설정 중..." >> "$LOG"
# 퍼머링크 구조
wp option update permalink_structure '/%postname%/' --path="$WEB" --allow-root 2>> "$LOG" || true
# 타임존
wp option update timezone_string 'Asia/Seoul' --path="$WEB" --allow-root 2>> "$LOG" || true
# 날짜 형식
wp option update date_format 'Y년 n월 j일' --path="$WEB" --allow-root 2>> "$LOG" || true
wp option update time_format 'H:i' --path="$WEB" --allow-root 2>> "$LOG" || true
# 댓글 승인 필요
wp option update comment_moderation 1 --path="$WEB" --allow-root 2>> "$LOG" || true
# 블로그 설명
wp option update blogdescription "$SITEDESC" --path="$WEB" --allow-root 2>> "$LOG" || true
# 샘플 페이지 삭제
SAMPLE_ID=$(wp post list --post_type=page --name=sample-page --field=ID --path="$WEB" --allow-root 2>/dev/null | head -1)
if [ -n "$SAMPLE_ID" ]; then
  wp post delete "$SAMPLE_ID" --force --path="$WEB" --allow-root 2>> "$LOG" || true
fi
# 기본 카테고리 이름을 주제로 변경
wp term update category 1 --name="$TOPIC" --slug="$(echo $TOPIC | tr ' ' '-' | tr '[:upper:]' '[:lower:]')" \
  --path="$WEB" --allow-root 2>> "$LOG" || true
# Hello World 게시글 삭제
HELLO_ID=$(wp post list --post_type=post --name=hello-world --field=ID --path="$WEB" --allow-root 2>/dev/null | head -1)
if [ -n "$HELLO_ID" ]; then
  wp post delete "$HELLO_ID" --force --path="$WEB" --allow-root 2>> "$LOG" || true
fi
echo "[STEP:settings:OK] 기본 설정 완료" >> "$LOG"

# STEP 11: Rank Math SEO 설정
echo "[STEP:seo] Rank Math SEO 설정 중..." >> "$LOG"
wp option update rank_math_modules '{"breadcrumbs":"1","sitemap":"1","seo-analysis":"1","link-counter":"1"}' \
  --format=json --path="$WEB" --allow-root 2>> "$LOG" || true
wp option update rank_math_sitemap_options '{"items_per_page":200,"exclude_roles":[],"include_images":1}' \
  --format=json --path="$WEB" --allow-root 2>> "$LOG" || true
# 리라이트 규칙 플러시
wp rewrite flush --path="$WEB" --allow-root 2>> "$LOG" || true
echo "[STEP:seo:OK] Rank Math SEO 설정 완료" >> "$LOG"

# STEP 12: WP Fastest Cache 설정
echo "[STEP:cache] 캐시 설정 중..." >> "$LOG"
wp option update WpFastestCacheOptions '{"wpFastestCacheStatus":"on","wpFastestCacheHtmlMinification":"on","wpFastestCacheCombineCss":"on","wpFastestCacheCombineJs":"on","wpFastestCacheMinifyJs":"on","wpFastestCacheMinifyCss":"on","wpFastestCacheNewPost":"on","wpFastestCacheUpdatePost":"on","wpFastestCacheByLoggedInUser":"on","wpFastestCacheLanguage":"ko_KR"}' \
  --format=json --path="$WEB" --allow-root 2>> "$LOG" || true
echo "[STEP:cache:OK] 캐시 설정 완료" >> "$LOG"

# STEP 13: 파일 권한 설정
echo "[STEP:perms] 파일 권한 설정 중..." >> "$LOG"
find "$WEB" -type d -exec chmod 755 {} \\; 2>> "$LOG" || true
find "$WEB" -type f -exec chmod 644 {} \\; 2>> "$LOG" || true
chmod 600 "$WEB/wp-config.php" 2>> "$LOG" || true
echo "[STEP:perms:OK] 파일 권한 설정 완료" >> "$LOG"

# 완료
echo "[INFO] ===== 설치 완료 정보 =====" >> "$LOG"
echo "[INFO] 사이트 URL: $SITEURL" >> "$LOG"
echo "[INFO] 관리자 URL: $SITEURL/wp-admin" >> "$LOG"
echo "[INFO] 관리자 계정: admin / (입력한 비밀번호)" >> "$LOG"
echo "[INFO] " >> "$LOG"
echo "[INFO] ===== WebStation 설정 안내 =====" >> "$LOG"
echo "[INFO] DSM > Web Station > 가상 호스트 추가" >> "$LOG"
echo "[INFO] 호스트 이름: ${subdomain}.aboda.kr" >> "$LOG"
echo "[INFO] 포트: 80 (HTTP), 443 (HTTPS)" >> "$LOG"
echo "[INFO] 루트 폴더: web/${subdomain}" >> "$LOG"
echo "[INFO] PHP 버전: PHP 8.x" >> "$LOG"
echo "[INFO] " >> "$LOG"
echo "[INFO] ===== DNS 설정 안내 =====" >> "$LOG"
echo "[INFO] dnszi.com에서 CNAME 또는 A레코드 추가:" >> "$LOG"
echo "[INFO] ${subdomain}.aboda.kr → NAS의 외부 IP" >> "$LOG"
echo "[DONE:OK] 설치 완료! 사이트: $SITEURL/wp-admin" >> "$LOG"
`;
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  let body: {
    subdomain?: string;
    siteName?: string;
    siteDesc?: string;
    topic?: string;
    adminEmail?: string;
    adminPassword?: string;
    mysqlPassword?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 });
  }

  const { subdomain, siteName, siteDesc, topic, adminEmail, adminPassword, mysqlPassword = '' } = body;

  // Validate required fields
  if (!subdomain || !siteName || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다 (subdomain, siteName, adminEmail, adminPassword)' }, { status: 400 });
  }

  // Validate subdomain format
  const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$|^[a-z0-9]$/;
  if (!subdomainRegex.test(subdomain) || subdomain.length > 63) {
    return NextResponse.json({ error: '서브도메인은 소문자, 숫자, 하이픈만 사용 가능합니다 (최대 63자)' }, { status: 400 });
  }

  // Check if web folder already exists on NAS
  const checkResult = await nasExec(`test -d /volume1/web/${subdomain} && echo "EXISTS" || echo "NOT_EXISTS"`);
  if (checkResult.stdout.includes('EXISTS')) {
    return NextResponse.json({ error: `'/volume1/web/${subdomain}' 폴더가 이미 존재합니다` }, { status: 409 });
  }

  // Generate DB credentials
  const safeSubdomain = subdomain.replace(/-/g, '_');
  const dbName = `wp_${safeSubdomain}`.slice(0, 64);
  const dbUser = `wp_${safeSubdomain.slice(0, 14)}`;
  const dbPass = generateRandomPassword(16);
  const jobId = crypto.randomUUID();

  // Encode AdSense PHP as base64
  const adsenseBase64 = Buffer.from(ADSENSE_PHP).toString('base64');

  // Build shell script
  const scriptContent = buildSetupScript({
    subdomain,
    siteName,
    siteDesc: siteDesc || '',
    topic: topic || '일반',
    adminEmail,
    adminPassword,
    mysqlPassword: mysqlPassword || '',
    dbName,
    dbUser,
    dbPass,
    jobId,
    adsenseBase64,
  });

  try {
    // Write script to NAS via stdin
    const writeResult = await nasExecWithStdin(
      `cat > /tmp/wp_setup_${jobId}.sh`,
      scriptContent
    );

    if (writeResult.code !== 0) {
      return NextResponse.json({ error: `스크립트 파일 작성 실패: ${writeResult.stderr}` }, { status: 500 });
    }

    // Run script in background
    const runResult = await nasExec(
      `chmod +x /tmp/wp_setup_${jobId}.sh && nohup bash /tmp/wp_setup_${jobId}.sh > /dev/null 2>&1 &`
    );

    if (runResult.code !== 0 && runResult.stderr) {
      console.error('Background launch warning:', runResult.stderr);
    }

    return NextResponse.json({
      jobId,
      subdomain,
      siteUrl: `http://${subdomain}.aboda.kr`,
      adminUrl: `http://${subdomain}.aboda.kr/wp-admin`,
      status: 'started',
      message: '백그라운드 설치가 시작되었습니다. /api/wp-auto/status?job=' + jobId + ' 로 진행 상황을 확인하세요.',
    });
  } catch (err) {
    console.error('WP Auto setup error:', err);
    return NextResponse.json({ error: `NAS 연결 오류: ${String(err)}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  try {
    const result = await nasExec(
      `find /volume1/web -maxdepth 2 -name wp-config.php 2>/dev/null`
    );

    const sites: { subdomain: string; path: string; siteUrl: string; adminUrl: string }[] = [];

    if (result.stdout) {
      const lines = result.stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        // e.g. /volume1/web/mysite/wp-config.php
        const match = line.match(/^\/volume1\/web\/([^/]+)\/wp-config\.php$/);
        if (match) {
          const subdomain = match[1];
          // Skip hidden dirs like .wp-setup-logs
          if (subdomain.startsWith('.')) continue;
          sites.push({
            subdomain,
            path: `/volume1/web/${subdomain}`,
            siteUrl: `http://${subdomain}.aboda.kr`,
            adminUrl: `http://${subdomain}.aboda.kr/wp-admin`,
          });
        }
      }
    }

    return NextResponse.json({ sites });
  } catch (err) {
    console.error('WP list error:', err);
    return NextResponse.json({ error: `NAS 연결 오류: ${String(err)}` }, { status: 500 });
  }
}
