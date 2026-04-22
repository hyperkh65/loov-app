/**
 * GET /api/ollama/models
 * Ollama Cloud 공식 API (https://ollama.com/api/tags) 에서 지원 모델 목록 반환
 * 인증된 경우 사용자 키로 조회, 미인증 시 공개 엔드포인트 사용
 */
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

const FALLBACK_MODELS = [
  'qwen3', 'qwen3.5', 'qwen3-coder', 'llama3.3', 'llama3.2',
  'mistral', 'gemma3', 'deepseek-r1', 'phi4', 'gemma4',
  'gpt-oss', 'minimax-m2', 'devstral-small-2', 'ministral-3',
];

let _cache: { models: string[]; installed: string[]; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1시간

async function fetchCloudModels(apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // Ollama Cloud 공식 API
  const res = await fetch('https://ollama.com/api/tags', {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Ollama Cloud API ${res.status}`);
  const data = await res.json() as { models?: Array<{ name: string }> };
  const models = (data.models ?? []).map((m) => m.name);
  if (models.length === 0) throw new Error('빈 응답');
  return models;
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

  // 2. Ollama Cloud 공식 API (캐시 적용)
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
  const installedSet = new Set(installedModels.map((n) => n.split(':')[0]));
  const notInstalled = popularModels.filter((m) => !installedSet.has(m.split(':')[0]));

  return NextResponse.json({
    models: [...installedModels, ...notInstalled],
    installed: installedModels,
    popular: popularModels,
    serverConnected: installedModels.length > 0,
    source: 'ollama-cloud-api',
    cachedAt: new Date(_cache.ts).toISOString(),
  });
}
