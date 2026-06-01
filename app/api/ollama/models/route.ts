/**
 * GET /api/ollama/models
 * Ollama Cloud API + 검증된 큐레이션 목록 병합
 *
 * Ollama Cloud /api/tags 는 enterprise급 대형 모델(100GB~1.4TB)을 주로 반환해
 * 블로그 생성 용도(300초 타임아웃)에 적합하지 않음.
 * 70GB 이하 실용 모델만 필터링하고, 누락된 소형 모델은 큐레이션 목록으로 보완.
 */
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

// Ollama 라이브러리에 존재하며 블로그 생성에 적합한 모델 (≤70B)
// Cloud /api/tags 에 없더라도 ollama.com/api/chat 으로 실행 가능
const CURATED_MODELS = [
  // Meta Llama
  'llama3.3',          // 70B (Ollama 기본 추천)
  'llama3.2',          // 3B
  'llama3.2:1b',       // 1B (매우 빠름)
  'llama3.1',          // 8B
  // Qwen
  'qwen3',             // 8B default
  'qwen3:14b',
  'qwen3:30b-a3b',     // MoE, 효율적
  'qwen2.5',           // 7B
  'qwen2.5:14b',
  // Mistral
  'mistral',           // 7B
  'mistral-small-3.1', // 24B
  'ministral-3b',
  // Google
  'gemma3',            // 4B default
  'gemma3:12b',
  // DeepSeek
  'deepseek-r1',       // 7B default
  'deepseek-r1:14b',
  // Microsoft
  'phi4',              // 14B
  'phi4-mini',         // 3.8B
  // 기타
  'gemma4',            // 4B (가장 최신 Gemma)
  'rnj-1:8b',
];

// 70GB 이하 실용 모델 — Cloud API에서 직접 확인된 것
const MAX_PRACTICAL_BYTES = 70 * 1024 * 1024 * 1024;

let _cache: { models: string[]; installed: string[]; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1시간

async function fetchCloudPracticalModels(apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch('https://ollama.com/api/tags', {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Ollama Cloud API ${res.status}`);
  const data = await res.json() as { models?: Array<{ name: string; size: number }> };
  const allModels = data.models ?? [];
  if (allModels.length === 0) throw new Error('빈 응답');

  // 베이스명별 최소 사이즈 그룹핑 (사이즈가 0인 것은 제외)
  const sizeMap = new Map<string, number>();
  for (const m of allModels) {
    const base = m.name.split(':')[0];
    const size = m.size ?? 0;
    if (size <= 0) continue;
    const prev = sizeMap.get(base);
    if (prev === undefined || size < prev) sizeMap.set(base, size);
  }

  // 70GB 이하 모델만 선택
  const practical = [...sizeMap.entries()]
    .filter(([, size]) => size <= MAX_PRACTICAL_BYTES)
    .map(([base]) => base)
    .sort();

  return practical;
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

  // 2. Cloud 실용 모델 목록 (캐시 적용)
  const now = Date.now();
  if (!_cache || now - _cache.ts > CACHE_TTL) {
    const apiKey = await getSetting('OLLAMA_API_KEY');
    let cloudPractical: string[] = [];
    try {
      cloudPractical = await fetchCloudPracticalModels(apiKey || undefined);
    } catch {
      cloudPractical = [];
    }

    // 큐레이션 + Cloud 실용 모델 병합 (중복 제거, 큐레이션 우선)
    const merged = [...CURATED_MODELS];
    const mergedBaseSet = new Set(CURATED_MODELS.map((m) => m.split(':')[0]));
    for (const m of cloudPractical) {
      if (!mergedBaseSet.has(m)) {
        merged.push(m);
        mergedBaseSet.add(m);
      }
    }
    _cache = { models: merged, installed: installedModels, ts: now };
  }

  const popularModels = _cache.models;
  const installedBaseSet = new Set(installedModels.map((n) => n.split(':')[0]));
  const cloudOnly = popularModels.filter((m) => !installedBaseSet.has(m.split(':')[0]));

  return NextResponse.json({
    models: [...installedModels, ...cloudOnly],
    installed: installedModels,
    popular: popularModels,
    serverConnected: installedModels.length > 0,
    source: 'ollama-curated+cloud',
    cachedAt: new Date(_cache.ts).toISOString(),
  });
}
