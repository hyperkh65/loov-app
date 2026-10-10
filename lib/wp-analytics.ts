export const GA_ID = 'GT-WVG7Q63';

// 방문/체류시간 비콘 + GA4(gtag)를 wp_head에 출력하는 mu-plugin. miracool은 이미 GA가 있어 gtag만 생략.
export function analyticsMuPlugin(): string {
  return `<?php
/**
 * Plugin Name: LOOV Analytics
 * Description: GA4 + 방문/체류시간 비콘
 */
if (!defined('ABSPATH')) exit;
add_action('wp_head', function () {
    if (is_admin() || is_user_logged_in()) return;
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (strpos($host, 'miracool.co.kr') === false) {
        echo '<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>';
        echo '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${GA_ID}");</script>';
    }
    ?>
<script>
(function(){try{
var u='https://loov.co.kr/api/analytics/beacon',s=Math.random().toString(36).slice(2)+Date.now().toString(36);
function send(o){var b=JSON.stringify(o);if(navigator.sendBeacon)navigator.sendBeacon(u,b);else fetch(u,{method:'POST',body:b,keepalive:true,mode:'no-cors'})}
send({t:'pv',s:s,h:location.hostname,p:location.pathname,r:(new URLSearchParams(location.search).get('utm_source')?'utm:'+new URLSearchParams(location.search).get('utm_source'):document.referrer)});
var vis=0,last=Date.now(),on=!document.hidden;
function tick(){if(on)vis+=Date.now()-last;last=Date.now()}
function dwell(){tick();send({t:'d',s:s,d:Math.round(vis/1000)})}
document.addEventListener('visibilitychange',function(){tick();on=!document.hidden;if(document.hidden)dwell()});
addEventListener('pagehide',dwell);
}catch(e){}})();
</script>
<?php
}, 99);
`;
}
