/**
 * GET /api/ollama/models
 * Ollama Cloud 공식 API (https://ollama.com/api/tags) 에서 지원 모델 목록 반환
 */
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

// API 실패 시 폴백 — 실제 Ollama에 존재하는 검증된 베이스명
const FALLBACK_MODELS = [
  'qwen3', 'qwen3.5', 'qwen3-coder',
  'llama3.3', 'llama3.2', 'llama3.1',
  'mistral', 'mistral-small-3.1',
  'gemma3', 'gemma3:4b',
  'deepseek-r1', 'deepseek-v3',
  'phi4', 'phi4-mini',
  'gemma4',
  'devstral', 'ministral-3b',
];

let _cache: { models: string[]; installed: string[]; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1시간

// API 응답에서 베이스 모델명만 추출 + 중복 제거
// 예: ["qwen3:7b", "qwen3:14b", "qwen3:latest"] → ["qwen3"]
// 단, 로컬 설치 모델은 태그 포함 전체 이름 유지
function deduplicateBaseNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const base = name.split(':')[0];
    if (!seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
}

async function fetchCloudModels(apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch('https://ollama.com/api/tags', {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Ollama Cloud API ${res.status}`);
  const data = await res.json() as { models?: Array<{ name: string }> };
  const rawNames = (data.models ?? []).map((m) => m.name);
  if (rawNames.length === 0) throw new Error('빈 응답');
  // 베이스명 중복 제거 후 알파벳 정렬
  return deduplicateBaseNames(rawNames).sort();
}

export async function GET() {
  // 1. 로컬 Ollama 서버 설치 모델 (태그 포함 전체 이름 유지)
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

  // 2. Ollama Cloud 모델 목록 (캐시 적용)
  const now = Date.now();
  if (!_cache || now - _cache.ts > CACHE_TTL) {
    const apiKey = await getSetting('OLLAMA_API_KEY');
    try {
      const cloudModels = await fetchCloudModels(apiKey || undefined);
      _cache = { models: cloudModels, installed: installedModels, ts: now };
    } catch {
      _cache = { models: FALLBACK_MODELS, installed: installedModels, ts: now };
    }
  }

  const popularModels = _cache.models;
  const installedBaseSet = new Set(installedModels.map((n) => n.split(':')[0]));
  // 이미 로컬에 설치된 모델은 Cloud 목록에서 제외
  const cloudOnly = popularModels.filter((m) => !installedBaseSet.has(m.split(':')[0]));

  return NextResponse.json({
    models: [...installedModels, ...cloudOnly],
    installed: installedModels,
    popular: popularModels,
    serverConnected: installedModels.length > 0,
    source: 'ollama-cloud-api',
    cachedAt: new Date(_cache.ts).toISOString(),
  });
}
