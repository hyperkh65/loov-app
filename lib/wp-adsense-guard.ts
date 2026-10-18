export const OWN_PUB = '8940400388075870';

// 본문에 박힌 다른 애드센스 계정(ca-pub-*) 광고를 렌더 시점에 제거하는 mu-plugin. DB는 건드리지 않아 mu-plugin 파일만 지우면 원복됨.
export function adsenseGuardMuPlugin(): string {
  return String.raw`<?php
/**
 * Plugin Name: LOOV AdSense Guard
 * Description: 본문 내 타 계정 애드센스 광고 제거(내 계정 ca-pub-${OWN_PUB}만 허용)
 */
if (!defined('ABSPATH')) exit;
add_filter('the_content', function ($c) {
    $own = '${OWN_PUB}';
    $sep = '(?:\s|<br\s*/?>|</?p(?:\s[^>]*)?>)*';
    $ld  = '(?:<script[^>]*adsbygoogle\.js\?client=ca-pub-\d+[^>]*>\s*</script>' . $sep . ')?';
    $cm  = '(?:<!--(?:(?!-->).)*-->' . $sep . ')?';
    $ins = '<ins[^>]*data-ad-client="ca-pub-(\d+)"[^>]*>(?:(?!</ins>).)*</ins>';
    $push = '<script[^>]*>\s*\(adsbygoogle\s*=\s*window\.adsbygoogle\s*\|\|\s*\[\]\)\.push\(\{\s*\}\);?\s*</script>';
    $keep = function ($m) use ($own) { return $m[1] === $own ? $m[0] : ''; };
    $r = preg_replace_callback('~' . $ld . $cm . $ins . $sep . $push . '~is', $keep, $c);
    if ($r === null) return $c;
    $r2 = preg_replace_callback('~' . $ins . '~is', $keep, $r);
    if ($r2 === null) return $r;
    $r3 = preg_replace_callback('~<script[^>]*adsbygoogle\.js\?client=ca-pub-(\d+)[^>]*>\s*</script>~is', $keep, $r2);
    return $r3 === null ? $r2 : $r3;
}, 99999);
`.replaceAll('${OWN_PUB}', OWN_PUB);
}
