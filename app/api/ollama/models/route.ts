/**
 * GET /api/ollama/models
 * ollama.com/search 를 크롤링해서 최신 모델 목록을 동적으로 반환 (6시간 서버 캐시)
 * 실패 시 hardcoded fallback 사용
 */
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

// 크롤링 실패 시 fallback
const FALLBACK_MODELS = [
  'qwen3.5', 'qwen3', 'qwen3-coder', 'qwen3-vl',
  'llama3.3', 'llama3.2', 'mistral', 'mistral-small3.1',
  'gemma3', 'deepseek-r1', 'phi4', 'phi4-mini',
  'ministral-3', 'qwen2.5', 'qwen2.5-coder', 'deepseek-v3',
  'minimax-m2.7', 'command-r', 'granite3.3', 'smollm2',
  'codellama', 'llava', 'solar-pro', 'command-r-plus',
];

// 모듈 레벨 캐시 (6시간)
let _cache: { models: string[]; ts: number; source: string } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

async function scrapeOllamaModels(): Promise<string[]> {
  const seen = new Set<string>();
  const results: string[] = [];

  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`https://ollama.com/search?sort=popular&p=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) break;
    const html = await res.text();

    // ollama.com 모델 링크: href="/modelname" (최상위 경로, 알파벳/숫자/점/하이픈)
    let found = 0;
    for (const m of html.matchAll(/href="\/([a-z][a-z0-9._-]{1,39})"/g)) {
      const name = m[1];
      // UI 경로 제외
      if (['search', 'library', 'blog', 'docs', 'login', 'signup', 'settings',
           'pricing', 'about', 'download', 'api', 'models', 'tags',
           'terms', 'privacy', 'faq', 'contact'].includes(name)) continue;
      if (!seen.has(name)) { seen.add(name); results.push(name); found++; }
    }
    // 이 페이지에서 새 모델 없으면 중단
    if (found === 0) break;
  }
  return results;
}

export async function GET() {
  // 1. 로컬 Ollama 서버 설치 모델
  const baseUrl = await getSetting('OLLAMA_BASE_URL');
  let installedModels: string[] = [];
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        installedModels = (data.models ?? []).map((m) => m.name);
      }
    } catch { /* 로컬 서버 없음 */ }
  }

  // 2. 캐시 확인 후 ollama.com 크롤링
  const now = Date.now();
  if (!_cache || now - _cache.ts > CACHE_TTL) {
    try {
      const scraped = await scrapeOllamaModels();
      if (scraped.length >= 5) {
        // fallback 모델 중 누락된 것 끝에 추가
        for (const m of FALLBACK_MODELS) {
          if (!scraped.includes(m)) scraped.push(m);
        }
        _cache = { models: scraped, ts: now, source: 'live' };
      } else {
        _cache = { models: FALLBACK_MODELS, ts: now, source: 'fallback' };
      }
    } catch {
      _cache = { models: FALLBACK_MODELS, ts: now, source: 'fallback' };
    }
  }

  const popularModels = _cache.models;
  const installedSet = new Set(installedModels.map((n) => n.split(':')[0]));
  const notInstalled = popularModels.filter((m) => !installedSet.has(m.split(':')[0]));

  return NextResponse.json({
    models: [...installedModels, ...notInstalled],
    installed: installedModels,
    popular: popularModels,
    serverConnected: installedModels.length > 0,
    source: _cache.source,
    cachedAt: new Date(_cache.ts).toISOString(),
  });
}
