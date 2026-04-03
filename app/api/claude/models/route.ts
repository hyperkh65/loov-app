/**
 * GET /api/claude/models
 * Anthropic /v1/models API에서 현재 지원 모델 목록을 동적으로 가져옴
 * API 키 없거나 실패 시 curated fallback 반환
 */
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

// 로컬 fallback (API 실패 또는 키 없을 때)
const FALLBACK_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

interface AnthropicModel {
  id: string;
  display_name: string;
  created_at: string;
  type: string;
}

export async function GET() {
  const apiKey = await getSetting('CLAUDE_API_KEY');

  if (!apiKey) {
    return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10000),
      // 1시간 캐시
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback', error: `HTTP ${res.status}` });
    }

    const data = await res.json() as { data: AnthropicModel[] };
    const models = (data.data || [])
      .filter((m) => m.type === 'model' && m.id.startsWith('claude-'))
      // 최신 모델 먼저 (created_at 기준 내림차순)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((m) => m.id);

    if (models.length === 0) {
      return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
    }

    return NextResponse.json({ models, source: 'api', count: models.length });
  } catch {
    return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
  }
}
