export function isBotUA(ua: string): boolean {
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|python-requests|curl|wget|node-fetch|axios|go-http|okhttp|monitor|uptime|lighthouse|pingdom/i.test(ua);
}
