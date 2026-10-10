import { sanitizeInvisible } from '@/lib/html-gate';

// 모델이 [[[TW]}/${TWITTER]]] 처럼 구분자를 깨뜨려 내놔도 섹션을 나누고, 캡션에 잔재가 안 남게 한다.
const ALIASES: Record<string, string[]> = {
  TWITTER: ['TW', 'X'], INSTAGRAM: ['IG', 'INSTA'], FACEBOOK: ['FB'], THREADS: ['THREAD', 'TH'],
};

function markerTag(line: string, allTags: string[]): string | null {
  if (line.length > 60 || !/\[\[/.test(line)) return null;
  const up = line.toUpperCase();
  for (const t of allTags) if (new RegExp(`(^|[^A-Z])${t}([^A-Z]|$)`).test(up)) return t;
  for (const t of allTags) for (const a of ALIASES[t] || []) if (new RegExp(`(^|[^A-Z])${a}([^A-Z]|$)`).test(up)) return t;
  return null;
}

export function cleanCaption(s: string): string {
  return sanitizeInvisible(s)
    .replace(/[￼�]/g, '')
    .replace(/\$\{[^}\n]*\}?/g, '')
    .replace(/\[{2,}[^\]\n]*\]*[^\n]*?\]{2,}/g, '')
    .replace(/\[{2,}|\]{2,}/g, '')
    .trim();
}

export function getSection(text: string, tag: string, allTags: string[]): string {
  let cur: string | null = null;
  const buf: string[] = [];
  for (const line of text.split('\n')) {
    const mt = markerTag(line, allTags);
    if (mt) {
      cur = mt;
      const rest = line.replace(/\[{2,}[^\n]*?\]{2,}/, '');
      if (cur === tag && rest.trim()) buf.push(rest);
      continue;
    }
    if (cur === tag) buf.push(line);
  }
  return cleanCaption(buf.join('\n'));
}
