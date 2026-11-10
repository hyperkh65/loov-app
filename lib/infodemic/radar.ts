import { isSensitive } from './write';

export interface RadarCand { title: string; link: string; summary: string; body: string }

const RADAR_FEED = 'https://www.mbcdy.com/feed';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const tag = (b: string, t: string) => (b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// 광고 단가·정책 위험이 큰 정치·사건·사고·전쟁 주제는 레이더에서 제외(작성 단계 선별 외에 한 번 더)
const RADAR_BLOCK = /살해|살인|신상|피의자|체포|검거|스토킹|간첩|특검|구형|대법|탄핵|국민의힘|민주당|당정|의총|국정|파병|전쟁|무인기|추락|화재|사고|테러|총기|난사|학대|학폭|사칭|열애|결별|이혼|불법|폭로|논란/;
const bg = (s: string) => { const t = s.replace(/\s+/g, ''); const o = new Set<string>(); for (let i = 0; i + 2 <= t.length; i++) o.add(t.slice(i, i + 2)); return o; };
const sim = (a: Set<string>, b: Set<string>) => { let i = 0; a.forEach(v => { if (b.has(v)) i++; }); return i / Math.max(1, a.size + b.size - i); };

/** mbcdy.com 피드에서 "지금 뜨는 주제"만 뽑는다 — 같은 사건을 여러 번 올린 횟수가 많을수록 뜨는 주제. 제목·본문은 글에 쓰지 않는다(주제 신호 전용). */
export async function radarCandidates(used: Set<string>): Promise<RadarCand[]> {
  const titles: Array<{ title: string; link: string }> = [];
  for (const page of [1, 2]) {
    try {
      const xml = await (await fetch(`${RADAR_FEED}?paged=${page}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).text();
      for (const b of xml.match(/<item>[\s\S]*?<\/item>/g) || []) { const title = tag(b, 'title'), link = tag(b, 'link'); if (title && /^https?:/.test(link)) titles.push({ title, link }); }
    } catch { /* 한 페이지 실패는 무시 */ }
  }
  const sets = titles.map(t => bg(t.title));
  const clusters: Array<{ rep: number; n: number }> = [];
  titles.forEach((_, i) => {
    const c = clusters.find(c => sim(sets[c.rep], sets[i]) > 0.22);
    if (c) c.n++; else clusters.push({ rep: i, n: 1 });
  });
  return clusters.sort((a, b) => b.n - a.n)
    .map(c => ({ title: titles[c.rep].title, link: titles[c.rep].link, summary: `${c.n}건`, body: '' }))
    .filter(c => !used.has(c.link) && !isSensitive(c.title) && !RADAR_BLOCK.test(c.title)).slice(0, 40);
}

