/**
 * sync-sites가 10~20분마다 도는데 대부분의 폴링은 "새 글 없음"으로 끝남 —
 * 근데 그 판단을 매번 Supabase에 물어봐서(소스당 2번 쿼리) 낭비되는 디스크 IO가
 * 상당했음(Supabase 무료 플랜 nano 인스턴스 disk IO 100% 포화 원인 중 하나로 확인).
 * 컨테이너 자체 디스크(도커 볼륨, 배포해도 안 지워짐)에 "마지막으로 본 글"만
 * 캐싱해서, 직전과 똑같은 글이면 Supabase를 아예 안 건드리고 바로 스킵.
 * 새 글일 가능성이 있을 때만(캐시에 없을 때) 기존처럼 Supabase로 진짜 확인.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const CACHE_PATH = '/app/.rewrite-cache/seen.json';
const MAX_ENTRIES_PER_SOURCE = 30;

type CacheShape = Record<string, string[]>; // source_id -> 최근 본 "title|url" 키 목록(최신이 뒤)

function load(): CacheShape {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function save(cache: CacheShape) {
  try {
    const dir = dirname(CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch { /* 캐시 저장 실패해도 정상 동작(Supabase 폴백)에는 영향 없음 */ }
}

function key(title: string, url: string): string {
  return `${title}|${url}`;
}

/** 컨테이너 재시작 직후(캐시 비어있음) 등 확실하지 않을 땐 false를 줘서 기존 Supabase 확인 경로로 폴백 */
export function wasRecentlySeen(sourceId: string, title: string, url: string): boolean {
  const cache = load();
  return (cache[sourceId] || []).includes(key(title, url));
}

export function markSeen(sourceId: string, title: string, url: string) {
  const cache = load();
  const list = cache[sourceId] || [];
  const k = key(title, url);
  const next = [k, ...list.filter((x) => x !== k)].slice(0, MAX_ENTRIES_PER_SOURCE);
  cache[sourceId] = next;
  save(cache);
}
