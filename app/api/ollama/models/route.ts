import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export type ModelCategory = 'light' | 'medium' | 'heavy';

export interface OllamaModelInfo {
  id: string;       // 모델 이름 (e.g. "llama3.3:cloud")
  base: string;     // 기본 이름 (e.g. "llama3.3")
  size: number;     // 바이트 (0 = 미확인)
  category: ModelCategory;
}

// 이름에서 카테고리 추정 (size 없을 때 fallback)
function inferCategory(name: string, sizeBytes: number): ModelCategory {
  if (sizeBytes > 0) {
    if (sizeBytes <= 8 * 1024 ** 3) return 'light';
    if (sizeBytes <= 25 * 1024 ** 3) return 'medium';
    return 'heavy';
  }
  const lower = name.toLowerCase();
  if (/[:\-_](1|2|3|4)(\.?\d)?b/.test(lower) || /mini|small|tiny|nano/.test(lower)) return 'light';
  if (/[:\-_](30|32|34|40|65|70|72|110)(\.?\d)?b/.test(lower)) return 'heavy';
  return 'medium';
}

// 키별로 Ollama Cloud /api/tags 조회
async function fetchModelsForKey(apiKey: string): Promise<OllamaModelInfo[]> {
  const res = await fetch('https://ollama.com/api/tags', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { models?: Array<{ name: string; size?: number }> };
  const models = data.models ?? [];
  if (models.length === 0) return [];

  return models.map(m => {
    const size = m.size ?? 0;
    return {
      id: m.name,
      base: m.name.split(':')[0],
      size,
      category: inferCategory(m.name, size),
    };
  });
}

// 서버-사이드 캐시 (키별, TTL 가변)
const _cache = new Map<string, { models: OllamaModelInfo[]; ts: number }>();
const DEFAULT_TTL = 10 * 60 * 1000; // 10분 (기본)

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';

  // 모든 Ollama API 키 수집
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

  if (keys.length === 0) {
    return NextResponse.json({ models: [], categories: { light: [], medium: [], heavy: [] }, error: 'Ollama API 키 미설정' });
  }

  // 캐시 키: 모든 키 합산 해시 대신 간단히 첫 키 앞 8자
  const cacheKey = keys.map(k => k.slice(0, 8)).join('|');
  const cached = _cache.get(cacheKey);
  const now = Date.now();

  let allModels: OllamaModelInfo[] = [];

  if (!refresh && cached && now - cached.ts < DEFAULT_TTL) {
    allModels = cached.models;
  } else {
    // 모든 키에서 모델 목록 병합 (중복 제거)
    const seen = new Map<string, OllamaModelInfo>();
    await Promise.allSettled(keys.map(async key => {
      const models = await fetchModelsForKey(key);
      for (const m of models) {
        if (!seen.has(m.id)) seen.set(m.id, m);
      }
    }));
    allModels = [...seen.values()].sort((a, b) => a.base.localeCompare(b.base));
    _cache.set(cacheKey, { models: allModels, ts: now });
  }

  // 카테고리별 분류
  const categories: Record<ModelCategory, string[]> = { light: [], medium: [], heavy: [] };
  for (const m of allModels) {
    categories[m.category].push(m.id);
  }

  // Claude 모델 추가 (별도)
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
    popular: allModels.map(m => m.id), // 기존 호환
    claude: claudeModels,
    keyCount: keys.length,
    cachedAt: new Date(now).toISOString(),
    fromCache: !refresh && !!cached,
  });
}
