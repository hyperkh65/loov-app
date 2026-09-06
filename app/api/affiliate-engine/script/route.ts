/**
 * POST /api/affiliate-engine/script
 * Phase 7: 스코어링된(SCORED) 상품에서 숏폼 영상 스크립트 생성.
 * 기존 /api/shorts/generate와 같은 계약(JSON: {title, hook, scenes:[{id,duration,narration,subtitle}]})을
 * 따르되, 상품 문제/특징을 재료로 쓰는 전용 프롬프트를 사용한다.
 * Body: { product_id: string, variant_label?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { callAI } from '@/lib/ai-call';

export const maxDuration = 60;

const SCENE_COUNT = 9; // 60초 기준 (shorts/generate의 SCENE_MAP[60])

const SYSTEM_PROMPT = '당신은 대한민국 최고의 숏폼 바이럴 콘텐츠 크리에이터입니다. 시청자가 첫 3초에 멈추고, 끝까지 보고, 공유하게 만드는 스크립트를 씁니다. 과장·허위 주장 없이 실제 상품 정보만 사용하세요. 반드시 유효한 JSON만 출력하며, 코드블록이나 추가 설명은 절대 포함하지 않습니다.';

function buildPrompt(input: {
  productName: string; brand: string | null; genericType: string | null;
  features: string[]; problemSolved: string | null; useCase: string | null;
  visualDescription: string | null;
}): string {
  return `아래 상품을 소개하는 60초 숏폼 영상 스크립트를 작성하세요. ${SCENE_COUNT}개 장면으로 구성.

상품명: ${input.productName}
브랜드: ${input.brand || '미상'}
종류: ${input.genericType || '미상'}
특징: ${input.features.join(', ') || '정보 없음'}
해결하는 문제: ${input.problemSolved || '정보 없음'}
사용 상황: ${input.useCase || '정보 없음'}
외관: ${input.visualDescription || '정보 없음'}

[구성]
- 장면1(훅, 3~5초): "이거 안 써봤으면 손해"류 강렬한 문제 제기. 상품명 직접 언급 금지.
- 장면2~3: 문제 상황 공감 (해결하는 문제를 구체적으로 보여줌)
- 장면4~6: 상품 등장 + 핵심 특징 하나씩 자연스럽게
- 장면7~8: 사용 후 만족감, 실제 사용 상황
- 장면9(마무리): 과장 없는 CTA (예: "궁금하면 찾아봐" 정도, 절대 노골적인 구매 강요 금지)

반드시 이 JSON 형식으로만 출력:
{
  "title": "영상 제목",
  "hook": "장면1의 후킹 문구",
  "scenes": [
    {"id": 1, "duration": 4, "narration": "나레이션 텍스트", "subtitle": "화면 자막(짧게)"}
  ]
}
scenes 배열은 반드시 ${SCENE_COUNT}개, 전체 나레이션은 반드시 한국어로만 작성 (외국어 절대 금지).`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const productId: string | undefined = body.product_id;
  const variantLabel: string = body.variant_label || 'A_CURIOSITY';
  if (!productId) return NextResponse.json({ error: 'product_id 필요' }, { status: 400 });

  const { data: product, error } = await supabase
    .from('affiliate_products')
    .select('id, product_name, brand, generic_product_type, features, problem_solved, use_case, visual_description, status')
    .eq('id', productId)
    .eq('user_id', user.id)
    .single();

  if (error || !product) return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });

  const prompt = buildPrompt({
    productName: product.product_name,
    brand: product.brand,
    genericType: product.generic_product_type,
    features: product.features || [],
    problemSolved: product.problem_solved,
    useCase: product.use_case,
    visualDescription: product.visual_description,
  });

  try {
    const result = await callAI({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4000,
      temperature: 0.85,
      useFallback: true,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('스크립트 생성 실패 (JSON 없음)');
    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string; hook: string;
      scenes: Array<{ id: number; duration: number; narration: string; subtitle: string }>;
    };

    const fullScript = (parsed.scenes || []).map(s => s.narration).join('\n\n');

    const { data: script, error: insertErr } = await supabase.from('affiliate_scripts').insert({
      user_id: user.id,
      product_id: productId,
      variant_label: variantLabel,
      hook_class: 'PROBLEM',
      hook_text: parsed.hook,
      full_script: fullScript,
      structure: { title: parsed.title, scenes: parsed.scenes },
      ai_model: result.model,
      validated: false,
    }).select().single();

    if (insertErr) throw new Error(insertErr.message);

    await supabase.from('affiliate_products').update({ status: 'READY', updated_at: new Date().toISOString() }).eq('id', productId);

    return NextResponse.json({ ok: true, script });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
