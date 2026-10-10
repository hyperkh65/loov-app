<?php
/**
 * 조회수 0인 글 일괄 처리 도구 (숨김/비공개/초안/noindex)
 *
 * 사용법:
 *   1. WordPress 루트(wp-config.php 있는 폴더)에 업로드
 *   2. https://2days.kr/cleanup-zero-views.php 접속
 *   3. 반드시 WordPress 관리자로 로그인된 상태에서 실행
 *   4. 사용 후 즉시 파일 삭제!
 */

if (!file_exists(dirname(__FILE__) . '/wp-load.php')) {
    die('wp-load.php를 찾을 수 없습니다. WordPress 루트에 업로드하세요.');
}
require_once(dirname(__FILE__) . '/wp-load.php');

if (!is_user_logged_in() || !current_user_can('edit_posts')) {
    wp_redirect(wp_login_url($_SERVER['REQUEST_URI']));
    exit;
}

global $wpdb;

// ─── 설정 ───────────────────────────────────────
$BATCH_SIZE   = 300;
$MIN_AGE_DAYS = 14;
// ────────────────────────────────────────────────

$action   = isset($_POST['action'])   ? $_POST['action']                         : '';
$offset   = isset($_POST['offset'])   ? intval($_POST['offset'])                 : 0;
$min_age  = isset($_POST['min_age'])  ? intval($_POST['min_age'])                : $MIN_AGE_DAYS;
$view_key = isset($_POST['view_key']) ? sanitize_text_field($_POST['view_key'])  : 'td_post_views';
$mode     = isset($_POST['mode'])     ? sanitize_text_field($_POST['mode'])      : 'private';
$nonce_ok = isset($_POST['nonce'])    && wp_verify_nonce($_POST['nonce'], 'cleanup_tool');

$MODE_LABELS = [
    'private'  => '비공개 (private) — URL 유지, 로그인 사용자만 접근',
    'draft'    => '초안 (draft) — URL 404 처리, 완전 숨김',
    'noindex'  => 'noindex 태그 추가 — URL 유지, Google 색인만 제외',
    'delete'   => '완전 삭제 — 복구 불가',
];

// 탐지된 조회수 메타키
$detected_keys = $wpdb->get_results("
    SELECT meta_key, COUNT(*) as cnt
    FROM {$wpdb->postmeta}
    WHERE meta_key IN ('td_post_views','views','post_views_count',
                       '_post-views-count','_jetpack_post_views_count',
                       'wpb_post_views_count','wp_post_views')
    GROUP BY meta_key ORDER BY cnt DESC
");

$date_limit = date('Y-m-d', strtotime("-{$min_age} days"));

$count_query = $wpdb->prepare("
    SELECT COUNT(DISTINCT p.ID)
    FROM {$wpdb->posts} p
    LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = %s
    WHERE p.post_type = 'post'
      AND p.post_status = 'publish'
      AND p.post_date < %s
      AND (CAST(pm.meta_value AS UNSIGNED) = 0 OR pm.meta_value IS NULL)
", $view_key, $date_limit);
$zero_view_count = intval($wpdb->get_var($count_query));
$total_posts     = intval($wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='post' AND post_status='publish'"));

// ─── 처리 실행 ────────────────────────────────────
$processed = 0;
$errors    = [];
$done      = false;

if (in_array($action, ['private','draft','noindex','delete']) && $nonce_ok) {
    $ids = $wpdb->get_col($wpdb->prepare("
        SELECT DISTINCT p.ID
        FROM {$wpdb->posts} p
        LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = %s
        WHERE p.post_type = 'post'
          AND p.post_status = 'publish'
          AND p.post_date < %s
          AND (CAST(pm.meta_value AS UNSIGNED) = 0 OR pm.meta_value IS NULL)
        ORDER BY p.ID ASC
        LIMIT %d OFFSET %d
    ", $view_key, $date_limit, $BATCH_SIZE, $offset));

    foreach ($ids as $id) {
        $id = intval($id);
        $ok = false;

        if ($action === 'private') {
            $ok = (bool) wp_update_post(['ID' => $id, 'post_status' => 'private']);
        } elseif ($action === 'draft') {
            $ok = (bool) wp_update_post(['ID' => $id, 'post_status' => 'draft']);
        } elseif ($action === 'noindex') {
            // Rank Math
            if (defined('RANK_MATH_VERSION') || function_exists('rank_math')) {
                update_post_meta($id, 'rank_math_robots', ['noindex']);
                $ok = true;
            }
            // Yoast SEO
            update_post_meta($id, '_yoast_wpseo_meta-robots-noindex', '1');
            // 범용 메타 (테마/플러그인 없을 때)
            update_post_meta($id, '_noindex', '1');
            $ok = true;
        } elseif ($action === 'delete') {
            $ok = (bool) wp_delete_post($id, true);
        }

        if ($ok) $processed++;
        else $errors[] = $id;
    }
    $done = (count($ids) < $BATCH_SIZE);
    $mode = $action;
}

$nonce = wp_create_nonce('cleanup_tool');
?>
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>조회수 0 글 정리 도구</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, sans-serif; background: #f0f2f5; padding: 24px; color: #222; }
.card { background: #fff; border-radius: 12px; padding: 28px; max-width: 760px; margin: 0 auto 20px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
.subtitle { font-size: 13px; color: #888; margin-bottom: 24px; }
h2 { font-size: 15px; font-weight: 700; margin-bottom: 12px; color: #333; }
.stat { display: flex; gap: 14px; margin-bottom: 24px; }
.stat-box { flex: 1; background: #f8f9fa; border-radius: 10px; padding: 16px; text-align: center; }
.stat-box .num { font-size: 30px; font-weight: 800; color: #1a73e8; }
.stat-box.danger .num { color: #e53935; }
.stat-box .label { font-size: 12px; color: #888; margin-top: 4px; }
label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #444; }
select, input[type=number] { width: 100%; border: 1px solid #ddd; border-radius: 7px; padding: 9px 12px; font-size: 14px; margin-bottom: 16px; }
.mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
.mode-card { border: 2px solid #e0e0e0; border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: all .15s; }
.mode-card:hover { border-color: #1a73e8; background: #f0f7ff; }
.mode-card.selected { border-color: #1a73e8; background: #e8f0fe; }
.mode-card.selected-delete { border-color: #e53935; background: #ffebee; }
.mode-card input { display: none; }
.mode-card .title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.mode-card .desc { font-size: 12px; color: #666; line-height: 1.5; }
.mode-card .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; margin-bottom: 6px; }
.badge-safe { background: #e8f5e9; color: #2e7d32; }
.badge-warn { background: #fff3e0; color: #e65100; }
.badge-danger { background: #ffebee; color: #c62828; }
.btn { display: block; width: 100%; padding: 13px; border-radius: 9px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; text-align: center; margin-top: 8px; }
.btn-go { background: #1a73e8; color: #fff; }
.btn-go:hover { background: #1557b0; }
.btn-delete { background: #e53935; color: #fff; }
.btn-next { background: #1a73e8; color: #fff; }
.btn-preview { background: #f5f5f5; color: #333; }
.result { border-radius: 9px; padding: 14px 16px; font-size: 14px; margin-top: 16px; }
.result.ok { background: #e8f5e9; border: 1px solid #a5d6a7; color: #2e7d32; }
.result.next { background: #e3f2fd; border: 1px solid #90caf9; color: #1565c0; }
.result.done { background: #e8f5e9; border: 1px solid #66bb6a; color: #1b5e20; font-weight: 700; font-size: 16px; }
.key-list { font-size: 12px; color: #555; background: #f5f5f5; border-radius: 7px; padding: 10px 14px; margin-bottom: 16px; }
.warn-box { background: #fff8e1; border: 1px solid #ffc107; border-radius: 8px; padding: 13px 16px; font-size: 13px; color: #7c5e00; margin-bottom: 18px; line-height: 1.7; }
.security { background: #fce4ec; border-radius: 8px; padding: 11px 15px; font-size: 12px; color: #880e4f; margin-top: 20px; }
table { width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 14px; }
th { background: #f5f5f5; padding: 8px 10px; text-align: left; border-bottom: 1px solid #ddd; }
td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
.progress-bar { height: 8px; background: #e0e0e0; border-radius: 4px; margin: 12px 0; overflow: hidden; }
.progress-fill { height: 100%; background: #1a73e8; border-radius: 4px; transition: width .3s; }
</style>
</head>
<body>
<div class="card">
  <h1>🧹 조회수 0 글 일괄 처리</h1>
  <p class="subtitle">2days.kr WordPress 정리 도구 — 사용 후 즉시 삭제하세요</p>

  <div class="stat">
    <div class="stat-box">
      <div class="num"><?= number_format($total_posts) ?></div>
      <div class="label">전체 발행 글</div>
    </div>
    <div class="stat-box danger">
      <div class="num"><?= number_format($zero_view_count) ?></div>
      <div class="label">조회수 0 (<?= $min_age ?>일 이상 된 글)</div>
    </div>
    <div class="stat-box">
      <div class="num"><?= number_format($total_posts - $zero_view_count) ?></div>
      <div class="label">조회수 있는 글</div>
    </div>
  </div>

  <?php if (!empty($detected_keys)): ?>
  <div class="key-list">
    <strong>감지된 조회수 메타키:</strong>
    <?php foreach ($detected_keys as $k): ?>
      <b style="color:#1a73e8"><?= esc_html($k->meta_key) ?></b>(<?= number_format($k->cnt) ?>개)&nbsp;
    <?php endforeach; ?>
  </div>
  <?php endif; ?>

  <?php
  // ─── 처리 결과 표시 ───────────────────────────────
  if (in_array($action, ['private','draft','noindex','delete']) && $nonce_ok):
    $action_labels = ['private'=>'비공개', 'draft'=>'초안', 'noindex'=>'noindex', 'delete'=>'삭제'];
    $label = $action_labels[$action] ?? $action;
  ?>
    <div class="result ok">
      ✅ 이번 배치 <strong><?= number_format($processed) ?>개 <?= $label ?> 처리</strong> 완료
      <?php if (!empty($errors)): ?>
        <br>⚠️ 실패 <?= count($errors) ?>개 (ID: <?= implode(', ', array_slice($errors,0,5)) ?>)
      <?php endif; ?>
    </div>

    <?php if ($done): ?>
    <div class="result done" style="margin-top:10px;">🎉 전체 처리 완료!</div>
    <?php else:
      $new_offset = $offset + $BATCH_SIZE;
      $pct = $total_posts > 0 ? min(100, round($new_offset / $zero_view_count * 100)) : 0;
    ?>
    <div class="result next">
      ⏳ 남은 글: 약 <strong><?= number_format(max(0, $zero_view_count - $new_offset)) ?>개</strong>
      <div class="progress-bar"><div class="progress-fill" style="width:<?= $pct ?>%"></div></div>
    </div>
    <form method="post">
      <input type="hidden" name="nonce"    value="<?= $nonce ?>">
      <input type="hidden" name="action"   value="<?= esc_attr($action) ?>">
      <input type="hidden" name="offset"   value="<?= $new_offset ?>">
      <input type="hidden" name="min_age"  value="<?= $min_age ?>">
      <input type="hidden" name="view_key" value="<?= esc_attr($view_key) ?>">
      <button type="submit" class="btn btn-next">▶ 다음 <?= $BATCH_SIZE ?>개 계속 처리</button>
    </form>
    <?php endif; ?>

  <?php else: ?>
  <!-- ─── 설정 폼 ──────────────────────────────────── -->
  <form method="post" id="mainForm">
    <input type="hidden" name="nonce" value="<?= $nonce ?>">
    <input type="hidden" name="offset" value="0">

    <h2>📋 처리 방식 선택</h2>
    <div class="mode-grid">
      <label class="mode-card selected" id="card_private" onclick="selectMode('private')">
        <input type="radio" name="mode" value="private" checked>
        <div class="badge badge-safe">✅ 권장</div>
        <div class="title">🔒 비공개 처리</div>
        <div class="desc">URL 유지, 로그인 사용자만 접근 가능.<br>언제든 복원 가능.</div>
      </label>
      <label class="mode-card" id="card_noindex" onclick="selectMode('noindex')">
        <input type="radio" name="mode" value="noindex">
        <div class="badge badge-safe">✅ 안전</div>
        <div class="title">🚫 noindex 추가</div>
        <div class="desc">글은 공개 유지, Google 색인만 제외.<br>독자는 볼 수 있음.</div>
      </label>
      <label class="mode-card" id="card_draft" onclick="selectMode('draft')">
        <input type="radio" name="mode" value="draft">
        <div class="badge badge-warn">⚠️ 주의</div>
        <div class="title">📄 초안으로 변경</div>
        <div class="desc">URL이 404가 됨.<br>복원 가능하지만 404 급증 주의.</div>
      </label>
      <label class="mode-card" id="card_delete" onclick="selectMode('delete')">
        <input type="radio" name="mode" value="delete">
        <div class="badge badge-danger">🔴 복구불가</div>
        <div class="title">🗑️ 완전 삭제</div>
        <div class="desc">DB에서 영구 삭제.<br>되돌릴 수 없음.</div>
      </label>
    </div>

    <label>조회수 메타키</label>
    <select name="view_key">
      <?php foreach (['td_post_views','views','post_views_count','_post-views-count','_jetpack_post_views_count','wpb_post_views_count'] as $k): ?>
      <option value="<?= $k ?>" <?= $k === $view_key ? 'selected' : '' ?>><?= $k ?></option>
      <?php endforeach; ?>
    </select>

    <label>기준: 발행 후 최소 경과 일수</label>
    <input type="number" name="min_age" value="<?= $min_age ?>" min="1" max="365">

    <div class="warn-box">
      ⚠️ <strong>비공개/초안 처리 전 알아두세요</strong><br>
      • <b>비공개</b>가 가장 안전 — URL 유지 + 언제든 복원 가능<br>
      • <b>noindex</b>는 Google 색인만 제거, 독자는 계속 볼 수 있음<br>
      • <b>초안</b>은 URL이 404가 되어 기존 색인 URL에서 오류 발생<br>
      • 처리 후 GSC 사이트맵 재제출 권장
    </div>

    <button type="submit" name="action" value="preview" class="btn btn-preview">🔍 대상 미리보기</button>
    <button type="submit" id="goBtn" name="action" value="private" class="btn btn-go"
      onclick="return confirmAction(this)">
      🚀 <?= number_format($zero_view_count) ?>개 비공개 처리 시작
    </button>
  </form>

  <?php if ($action === 'preview'): ?>
    <?php $preview = $wpdb->get_results($wpdb->prepare("
        SELECT DISTINCT p.ID, p.post_title, p.post_date,
               COALESCE(pm.meta_value,'0') as views
        FROM {$wpdb->posts} p
        LEFT JOIN {$wpdb->postmeta} pm ON p.ID=pm.post_id AND pm.meta_key=%s
        WHERE p.post_type='post' AND p.post_status='publish' AND p.post_date<%s
          AND (CAST(pm.meta_value AS UNSIGNED)=0 OR pm.meta_value IS NULL)
        ORDER BY p.post_date DESC LIMIT 20
    ", $view_key, $date_limit)); ?>
    <div style="margin-top:22px;">
      <h2>삭제 대상 샘플 (최근 20개 / 총 <?= number_format($zero_view_count) ?>개)</h2>
      <table>
        <tr><th>ID</th><th>제목</th><th>날짜</th><th style="text-align:center">조회수</th></tr>
        <?php foreach ($preview as $p): ?>
        <tr>
          <td style="color:#aaa"><?= $p->ID ?></td>
          <td><?= esc_html(mb_substr($p->post_title,0,42)) ?><?= mb_strlen($p->post_title)>42?'…':'' ?></td>
          <td style="color:#888"><?= substr($p->post_date,0,10) ?></td>
          <td style="text-align:center;color:#e53935;font-weight:700"><?= $p->views ?></td>
        </tr>
        <?php endforeach; ?>
      </table>
    </div>
  <?php endif; ?>

  <?php endif; ?>

  <div class="security">🔒 보안: 사용 후 cleanup-zero-views.php 파일을 서버에서 즉시 삭제하세요!</div>
</div>

<script>
function selectMode(mode) {
  ['private','noindex','draft','delete'].forEach(m => {
    const el = document.getElementById('card_' + m);
    if (el) { el.classList.remove('selected','selected-delete'); }
  });
  const card = document.getElementById('card_' + mode);
  if (card) card.classList.add(mode === 'delete' ? 'selected-delete' : 'selected');

  const btn = document.getElementById('goBtn');
  const count = <?= $zero_view_count ?>;
  const labels = {
    private: '🔒 비공개 처리 시작',
    noindex: '🚫 noindex 추가 시작',
    draft:   '📄 초안으로 변경 시작',
    delete:  '🗑️ 완전 삭제 시작',
  };
  btn.value = mode;
  btn.textContent = `${labels[mode]} (${count.toLocaleString()}개)`;
  btn.className = 'btn ' + (mode === 'delete' ? 'btn-delete' : 'btn-go');
}

function confirmAction(btn) {
  const mode = btn.value;
  const count = <?= $zero_view_count ?>;
  const msgs = {
    private: `조회수 0인 글 ${count.toLocaleString()}개를 비공개 처리합니다.\n언제든 복원 가능합니다. 계속할까요?`,
    noindex: `조회수 0인 글 ${count.toLocaleString()}개에 noindex를 추가합니다.\n글은 공개 유지되지만 Google에서 제외됩니다. 계속할까요?`,
    draft:   `조회수 0인 글 ${count.toLocaleString()}개를 초안으로 변경합니다.\nURL이 404가 됩니다. 계속할까요?`,
    delete:  `조회수 0인 글 ${count.toLocaleString()}개를 완전 삭제합니다.\n복구 불가능합니다! 정말 삭제할까요?`,
  };
  return confirm(msgs[mode] || '처리할까요?');
}
</script>
</body>
</html>
