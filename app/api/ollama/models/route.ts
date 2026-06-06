import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export type ModelCategory = 'light' | 'medium' | 'heavy';

export interface OllamaModelInfo {
  id: string;
  base: string;
  size: number;
  category: ModelCategory;
  fromLibrary?: boolean; // 라이브러리에서 가져온 모델 (계정 미등록)
}

function inferCategory(name: string, sizeBytes: number): ModelCategory {
  if (sizeBytes > 0) {
    if (sizeBytes <= 8 * 1024 ** 3) return 'light';
    if (sizeBytes <= 25 * 1024 ** 3) return 'medium';
    return 'heavy';
  }
  const lower = name.toLowerCase();
  if (/nano|small|flash|mini|light|tiny|[:\-_](1|2|3|4)(\.?\d)?b/.test(lower)) return 'light';
  if (/ultra|pro|super|large|[:\-_](70|72|80|110|120|235|397|480|671|675)(\.?\d)?b/.test(lower)) return 'heavy';
  return 'medium';
}

// 사용자 계정 모델 조회 (/api/tags)
async function fetchAccountModels(apiKey: string): Promise<OllamaModelInfo[]> {
  try {
    const res = await fetch('https://ollama.com/api/tags', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name: string; size?: number }> };
    return (data.models ?? []).map(m => ({
      id: m.name,
      base: m.name.split(':')[0],
      size: m.size ?? 0,
      category: inferCategory(m.name, m.size ?? 0),
    }));
  } catch { return []; }
}

// Ollama Cloud 라이브러리 전체 모델 조회 (search?c=cloud 스크래핑)
async function fetchLibraryModels(): Promise<OllamaModelInfo[]> {
  try {
    const res = await fetch('https://ollama.com/search?c=cloud', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // /library/MODEL-NAME 링크에서 모델명 추출
    const matches = [...html.matchAll(/href="\/library\/([a-z0-9][a-z0-9._-]*?)"/gi)];
    const names = [...new Set(matches.map(m => m[1]))].filter(n => n.length > 1);
    return names.map(name => ({
      id: name,
      base: name,
      size: 0,
      category: inferCategory(name, 0),
      fromLibrary: true,
    }));
  } catch { return []; }
}

// 서버-사이드 캐시 (TTL 가변)
const _cache = new Map<string, { models: OllamaModelInfo[]; ts: number }>();
const DEFAULT_TTL = 10 * 60 * 1000; // 10분
const LIBRARY_TTL = 60 * 60 * 1000; // 라이브러리는 1시간
let _libraryCache: { models: OllamaModelInfo[]; ts: number } | null = null;

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';

  // Ollama API 키 수집
  const keys: string[] = [];
  try {
    const raw = await getSetting('OLLAMA_API_KEYS');
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) keys.push(...arr.filter(Boolean));
    }
  } catch { /* ignore */ }
  const legacy = await getSetting('OLLAMA_API_KEY');
  if (legacy && !keys.includes(legacy)) keys.push(legacy);

  // ── 계정 모델 조회 ─────────────────────────────────────
  const cacheKey = keys.map(k => k.slice(0, 8)).join('|');
  const cached = _cache.get(cacheKey);
  const now = Date.now();

  let accountModels: OllamaModelInfo[] = [];
  if (!refresh && cached && now - cached.ts < DEFAULT_TTL) {
    accountModels = cached.models;
  } else if (keys.length > 0) {
    const seen = new Map<string, OllamaModelInfo>();
    await Promise.allSettled(keys.map(async key => {
      const models = await fetchAccountModels(key);
      for (const m of models) {
        if (!seen.has(m.id)) seen.set(m.id, m);
      }
    }));
    accountModels = [...seen.values()];
    _cache.set(cacheKey, { models: accountModels, ts: now });
  }

  // ── 라이브러리 모델 조회 (refresh 시 또는 캐시 만료 시) ──
  let libraryModels: OllamaModelInfo[] = [];
  if (!refresh && _libraryCache && now - _libraryCache.ts < LIBRARY_TTL) {
    libraryModels = _libraryCache.models;
  } else {
    libraryModels = await fetchLibraryModels();
    if (libraryModels.length > 0) {
      _libraryCache = { models: libraryModels, ts: now };
    }
  }

  // ── 병합: 계정 모델 우선, 라이브러리 전용 모델 추가 ──
  const accountBases = new Set(accountModels.map(m => m.base));
  const libraryOnly = libraryModels.filter(m => !accountBases.has(m.base));
  const allModels = [...accountModels, ...libraryOnly]
    .sort((a, b) => a.base.localeCompare(b.base));

  // 카테고리별 분류
  const categories: Record<ModelCategory, string[]> = { light: [], medium: [], heavy: [] };
  for (const m of allModels) categories[m.category].push(m.id);

  // Claude 모델
  const claudeModels: string[] = [];
  const claudeKey = await getSetting('CLAUDE_API_KEY');
  if (claudeKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=20', {
        headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { data: Array<{ id: string }> };
        claudeModels.push(...(data.data ?? []).map(m => m.id).filter(id => id.startsWith('claude-')));
      }
    } catch { /* ignore */ }
    if (claudeModels.length === 0) {
      claudeModels.push('claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7');
    }
  }

  return NextResponse.json({
    models: allModels,
    categories,
    popular: allModels.map(m => m.id),
    claude: claudeModels,
    keyCount: keys.length,
    accountCount: accountModels.length,
    libraryCount: libraryOnly.length,
    cachedAt: new Date(now).toISOString(),
    fromCache: !refresh && !!cached,
  });
}
