import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

interface ProductInfo {
  productName: string;
  productModel: string;
  productCategory: string;
  brand: string;
  keySpecs: string;
  targetUser: string;
  uniquePoints: string;
  priceRange: string;
}

function buildPrompt(info: ProductInfo, sectionKey?: string): string {
  const base = `제품 정보:
- 제품명: ${info.productName}
- 모델: ${info.productModel}
- 카테고리: ${info.productCategory}
- 브랜드: ${info.brand}
- 주요 사양: ${info.keySpecs}
- 타겟 고객: ${info.targetUser}
- 차별화 포인트: ${info.uniquePoints}
- 가격대: ${info.priceRange}`;

  if (sectionKey) {
    const sectionPrompts: Record<string, string> = {
      hero: `히어로 섹션 JSON만 반환:\n{"headline":"(20자 메인 헤드라인)","subheadline":"(40자 서브)","tagline":"(15자 슬로건)","keyPoints":["포인트1","포인트2","포인트3"]}`,
      features: `핵심기능 섹션 JSON만 반환:\n{"title":"섹션제목","items":[{"icon":"이모지","title":"기능명","desc":"설명60자"}]}  // items 6개`,
      design: `디자인 섹션 JSON만 반환:\n{"title":"디자인 스토리","designStory":"150자 본문","colorways":[{"name":"색상명","hex":"#hex","desc":"30자"}],"materials":["소재1","소재2","소재3"]}`,
      specs: `스펙 섹션 JSON만 반환:\n{"title":"상세 사양","groups":[{"groupName":"그룹명","rows":[{"label":"항목","value":"값"}]}]}  // groups 3개, rows 각 5개`,
      scenarios: `시나리오 섹션 JSON만 반환:\n{"title":"이런 분께 딱 맞습니다","items":[{"situation":"상황","desc":"80자","emoji":"이모지"}]}  // items 5개`,
      smart: `스마트기능 섹션 JSON만 반환:\n{"title":"스마트 기능","subtitle":"부제목","features":[{"name":"기능명","desc":"60자","icon":"이모지"}]}  // features 4개`,
      energy: `에너지효율 섹션 JSON만 반환:\n{"title":"에너지 효율","grade":"1등급","annualCost":"연간 전기요금 약 X만원","badges":[{"label":"배지텍스트","icon":"이모지"}],"comparisonNote":"동급 대비 X% 절전"}`,
      comparison: `비교표 섹션 JSON만 반환:\n{"title":"왜 이 제품인가요?","headers":["항목","${info.brand} ${info.productName}","경쟁사 A","경쟁사 B"],"rows":[{"feature":"항목명","values":["당사값 ✓","경쟁A값","경쟁B값"]}]}  // rows 6개`,
      inbox: `구성품 섹션 JSON만 반환:\n{"title":"구성품","items":[{"name":"구성품명","qty":"1개"}]}  // items 5개`,
      reviews: `리뷰 섹션 JSON만 반환:\n{"title":"실제 고객 리뷰","summary":"총평 한 줄","rating":"4.8","items":[{"author":"김**","rating":5,"body":"리뷰내용 100자","tag":"구매인증"}]}  // items 5개`,
      warranty: `AS보증 섹션 JSON만 반환:\n{"title":"믿을 수 있는 A/S","warrantyPeriod":"제품 3년, 핵심부품 5년","coverageItems":["보증항목1","보증항목2","보증항목3","보증항목4"],"serviceCenters":"전국 X개 서비스센터","note":"무상방문 서비스 포함"}`,
      cta: `구매CTA 섹션 JSON만 반환:\n{"headline":"지금 바로 경험하세요","subtext":"50자 부가설명","price":"X,XXX,000원","originalPrice":"X,XXX,000원","badge":"X% 할인","btnText":"지금 구매하기","installNote":"무이자 12개월 할부 가능"}`,
    };
    return `${base}\n\n위 제품의 상세페이지 섹션 콘텐츠를 한국어로 작성하세요.\n${sectionPrompts[sectionKey] ?? ''}\nJSON만 반환하세요.`;
  }

  // 전체 12섹션
  return `${base}

위 가전제품의 전자상거래 상세페이지 12개 섹션 콘텐츠를 한국어로 생성하세요.
다음 JSON 구조를 정확히 따르세요. JSON만 반환하세요.

{
  "hero": {"headline":"20자","subheadline":"40자","tagline":"15자","keyPoints":["","",""]},
  "features": {"title":"섹션제목","items":[{"icon":"이모지","title":"기능명","desc":"60자설명"}]},
  "design": {"title":"디자인 스토리","designStory":"150자","colorways":[{"name":"","hex":"#hex","desc":"30자"}],"materials":["","",""]},
  "specs": {"title":"상세 사양","groups":[{"groupName":"","rows":[{"label":"","value":""}]}]},
  "scenarios": {"title":"이런 분께 딱 맞습니다","items":[{"situation":"","desc":"80자","emoji":""}]},
  "smart": {"title":"스마트 기능","subtitle":"","features":[{"name":"","desc":"60자","icon":""}]},
  "energy": {"title":"에너지 효율","grade":"1등급","annualCost":"","badges":[{"label":"","icon":""}],"comparisonNote":""},
  "comparison": {"title":"왜 이 제품인가요?","headers":["항목","당사제품","경쟁사A","경쟁사B"],"rows":[{"feature":"","values":["","",""]}]},
  "inbox": {"title":"구성품","items":[{"name":"","qty":""}]},
  "reviews": {"title":"실제 고객 리뷰","summary":"","rating":"4.8","items":[{"author":"김**","rating":5,"body":"","tag":"구매인증"}]},
  "warranty": {"title":"믿을 수 있는 A/S","warrantyPeriod":"","coverageItems":["","","",""],"serviceCenters":"","note":""},
  "cta": {"headline":"","subtext":"","price":"","originalPrice":"","badge":"","btnText":"지금 구매하기","installNote":""}
}

features.items: 6개, scenarios.items: 5개, smart.features: 4개, specs.groups: 3개(각 rows 5개), comparison.rows: 6개, reviews.items: 5개, inbox.items: 5개, energy.badges: 3개, design.colorways: 3개`;
}

async function callAI(prompt: string, provider: string, apiKey: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await res.json() as { content?: { text: string }[] };
    return d.content?.[0]?.text ?? '';
  }
  if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const model = provider === 'gpt4o' ? 'gpt-4o' : provider === 'gpt4' ? 'gpt-4-turbo' : 'gpt-3.5-turbo';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 8000 }),
    });
    const d = await res.json() as { choices?: { message: { content: string } }[] };
    return d.choices?.[0]?.message?.content ?? '';
  }
  // Gemini
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await m.generateContent(prompt);
  return result.response.text();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { projectId, sectionKey, productInfo, provider = 'gemini', apiKey } = body as {
    projectId?: string;
    sectionKey?: string;
    productInfo: ProductInfo;
    provider: string;
    apiKey: string;
  };

  if (!productInfo?.productName) return NextResponse.json({ error: '제품명이 필요합니다' }, { status: 400 });

  // API 키 폴백
  let key = apiKey;
  if (!key) {
    const { data: settings } = await supabase
      .from('bossai_company_settings')
      .select('global_ai_config')
      .eq('user_id', user.id)
      .single();
    key = settings?.global_ai_config?.apiKey ?? '';
  }
  if (!key) return NextResponse.json({ error: 'AI API 키가 필요합니다' }, { status: 400 });

  const prompt = buildPrompt(productInfo, sectionKey ?? undefined);
  const raw = await callAI(prompt, provider, key);

  // JSON 파싱
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: 'AI 응답 파싱 실패', raw }, { status: 500 });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 실패', raw }, { status: 500 });
  }

  // DB 저장
  if (projectId) {
    const updateData = sectionKey
      ? { [`sections`]: { [sectionKey]: parsed } }
      : { sections: parsed, status: 'done' };

    if (sectionKey) {
      // 기존 sections에 merge
      const { data: proj } = await supabase
        .from('bossai_product_detail_projects')
        .select('sections')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .single();
      const merged = { ...(proj?.sections ?? {}), [sectionKey]: parsed };
      await supabase
        .from('bossai_product_detail_projects')
        .update({ sections: merged, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('bossai_product_detail_projects')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', user.id);
    }
  }

  return NextResponse.json({ sections: sectionKey ? { [sectionKey]: parsed } : parsed, sectionKey });
}
