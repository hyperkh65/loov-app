import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

// ollama.com 인기 모델 목록 (주기적으로 업데이트)
// https://ollama.com/search 기준 최신 popular 모델
const OLLAMA_POPULAR_MODELS = [
  // ── Qwen ──
  { name: 'qwen3.5',           desc: 'Qwen 3.5 · vision · thinking · multimodal' },
  { name: 'qwen3',             desc: 'Qwen 3 · 다국어 · 추론' },
  { name: 'qwen3-coder',       desc: 'Qwen 3 Coder · 코딩 특화' },
  { name: 'qwen3-vl',          desc: 'Qwen 3 VL · vision-language' },
  { name: 'qwen2.5',           desc: 'Qwen 2.5 · 안정 버전' },
  { name: 'qwen2.5-coder',     desc: 'Qwen 2.5 Coder · 코드 생성' },
  // ── Meta Llama ──
  { name: 'llama3.3',          desc: 'Llama 3.3 70B · Meta · 범용' },
  { name: 'llama3.2',          desc: 'Llama 3.2 · Meta · 경량' },
  { name: 'llama3.1',          desc: 'Llama 3.1 · Meta' },
  { name: 'codellama',         desc: 'Code Llama · Meta · 코딩' },
  // ── Mistral ──
  { name: 'mistral',           desc: 'Mistral 7B · 빠른 응답' },
  { name: 'mistral-small3.1',  desc: 'Mistral Small 3.1 · 최신' },
  { name: 'ministral-3',       desc: 'Ministral 3 · 경량 고성능' },
  // ── Google Gemma ──
  { name: 'gemma3',            desc: 'Gemma 3 · Google · 경량' },
  { name: 'gemma3:27b',        desc: 'Gemma 3 27B · Google · 대형' },
  // ── DeepSeek ──
  { name: 'deepseek-r1',       desc: 'DeepSeek R1 · 추론 특화' },
  { name: 'deepseek-v3',       desc: 'DeepSeek V3 · 최신' },
  // ── Microsoft Phi ──
  { name: 'phi4',              desc: 'Phi 4 · Microsoft · 초경량' },
  { name: 'phi4-mini',         desc: 'Phi 4 Mini · 초소형' },
  // ── 기타 ──
  { name: 'minimax-m2.7',      desc: 'MiniMax M2.7 · agentic · cloud' },
  { name: 'command-r',         desc: 'Command R · Cohere · RAG 특화' },
  { name: 'command-r-plus',    desc: 'Command R+ · Cohere · 고성능' },
  { name: 'granite3.3',        desc: 'Granite 3.3 · IBM · 기업용' },
  { name: 'solar-pro',         desc: 'Solar Pro · Upstage · 한국어' },
  { name: 'yi-coder',          desc: 'Yi Coder · 01.AI · 코딩' },
  { name: 'llava',             desc: 'LLaVA · 이미지 이해 · vision' },
  { name: 'smollm2',           desc: 'SmolLM2 · 초소형 · 온디바이스' },
  { name: 'nomic-embed-text',  desc: 'Nomic Embed · 임베딩' },
  { name: 'mxbai-embed-large', desc: 'mxbai Embed · 임베딩' },
];

export async function GET() {
  const baseUrl = await getSetting('OLLAMA_BASE_URL');

  // 로컬 Ollama 서버에서 설치된 모델 목록 가져오기
  let installedModels: string[] = [];
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        installedModels = (data.models ?? []).map((m) => m.name);
      }
    } catch {
      // 로컬 서버 연결 실패 - popular list만 반환
    }
  }

  // 설치된 모델을 맨 앞에, popular 모델 중 미설치된 것을 뒤에
  const installedSet = new Set(installedModels.map((n) => n.split(':')[0]));

  const popularNames = OLLAMA_POPULAR_MODELS.map((m) => m.name);
  const notInstalled = OLLAMA_POPULAR_MODELS
    .filter((m) => !installedSet.has(m.name.split(':')[0]))
    .map((m) => m.name);

  const allModels = [
    ...installedModels,
    ...notInstalled.filter((n) => !installedModels.includes(n)),
  ];

  return NextResponse.json({
    models: allModels,
    installed: installedModels,
    popular: popularNames,
    serverConnected: installedModels.length > 0,
    // 업데이트 날짜 (ollama.com/search 기준)
    updatedAt: '2026-04-03',
  });
}
