import dns from 'dns';
import net from 'net';

/** 임의 URL을 가져오기 전 SSRF 방어 — 사설/루프백/링크로컬 IP로 해석되면 거부.
 * 관리자가 붙여넣은 외부 URL(TikTok/YouTube/Amazon 등)만 통과시키기 위함. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('올바른 URL이 아닙니다');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('http/https URL만 허용됩니다');
  }

  const addresses = await dns.promises.lookup(url.hostname, { all: true });
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIPv4(address)) throw new Error('내부망 주소는 허용되지 않습니다');
    if (family === 6 && isPrivateIPv6(address)) throw new Error('내부망 주소는 허용되지 않습니다');
  }
  return url;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  if (ip === '::1') return true;
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  return false;
}

export interface OgMetadata {
  title: string;
  description: string;
  image: string;
  siteName: string;
}

/** 외부 페이지의 OG 메타데이터만 가져온다 — 영상/이미지 파일 자체는 절대 다운로드하지 않음
 * (권리 미확인 미디어는 REFERENCE_ONLY로만 취급, 섹션 15). */
export async function fetchOgMetadata(rawUrl: string): Promise<OgMetadata> {
  const url = await assertPublicUrl(rawUrl);
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV-AffiliateEngine/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`페이지를 가져오지 못했습니다 (${res.status})`);

  const reader = res.body?.getReader();
  let html = '';
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    while (bytes < 500_000) { // 최대 500KB만 읽음(메타 태그는 보통 <head>에 있음)
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytes += value.length;
    }
    reader.cancel().catch(() => {});
  }

  const getMeta = (prop: string): string => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
    const m = html.match(re);
    return m?.[1]?.trim() || '';
  };
  const titleTag = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || '';

  return {
    title: getMeta('og:title') || titleTag,
    description: getMeta('og:description') || getMeta('description'),
    image: getMeta('og:image'),
    siteName: getMeta('og:site_name'),
  };
}

/** URL 호스트로 소스 유형을 추정 — 소스 레지스트리와 매칭시키는 용도. */
export function detectSourcePlatform(rawUrl: string): string {
  let host = '';
  try { host = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('amazon.')) return 'amazon';
  if (host.includes('aliexpress.')) return 'aliexpress';
  if (host.includes('coupang.com')) return 'coupang';
  if (host.includes('pinterest.')) return 'pinterest';
  if (host.includes('douyin.com')) return 'douyin';
  if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) return 'xiaohongshu';
  if (host.includes('taobao.com') || host.includes('tmall.com')) return 'taobao';
  if (host.includes('1688.com')) return '1688';
  return 'unknown';
}
