/** 채널별 유입 측정용 utm_source 부착 — WP 비콘이 referrer 자리에 'utm:<source>'로 기록 */
export function withUtm(url: string, source: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', source.replace(/[^\w.-]/g, '').slice(0, 40));
    return u.toString();
  } catch { return url; }
}
