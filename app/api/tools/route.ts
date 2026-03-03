import { NextRequest, NextResponse } from 'next/server';

// 역할별 툴 정의
const ROLE_TOOLS: Record<string, Array<{ id: string; label: string; icon: string; prompt: string }>> = {
  '마케터': [
    { id: 'sns_trend', label: 'SNS 트렌드 분석', icon: '📈', prompt: '현재 인스타그램/틱톡의 인기 트렌드를 분석하고, 우리 브랜드에 맞는 콘텐츠 방향성을 5가지 제안해주세요.' },
    { id: 'caption', label: '캡션 자동 생성', icon: '✍️', prompt: '인스타그램 포스팅용 캡션을 5개 작성해주세요. 이모지, 해시태그 포함. 브랜드 톤은 친근하고 전문적으로.' },
    { id: 'hashtag', label: '해시태그 추천', icon: '#️⃣', prompt: '우리 비즈니스에 최적화된 인스타그램 해시태그 30개를 추천해주세요. 대형/중형/소형 태그를 골고루 포함해서.' },
    { id: 'email_copy', label: '이메일 마케팅 카피', icon: '📧', prompt: '고객 재구매를 유도하는 이메일 마케팅 카피를 작성해주세요. 제목, 본문, CTA 포함.' },
  ],
  '영업팀장': [
    { id: 'proposal', label: '제안서 초안', icon: '📄', prompt: '잠재 고객사에게 보낼 제안서 초안을 작성해주세요. 회사 소개, 제공 가치, 가격 제안, 다음 단계 포함.' },
    { id: 'cold_email', label: '콜드 이메일', icon: '📨', prompt: '잠재 고객에게 처음 연락하는 콜드 이메일을 작성해주세요. 80자 이내 제목, 200자 이내 본문, 명확한 CTA.' },
    { id: 'negotiation', label: '협상 전략', icon: '🤝', prompt: '가격 협상 시 활용할 수 있는 구체적인 협상 전략과 스크립트를 제안해주세요.' },
    { id: 'objection', label: '반대 의견 처리', icon: '💬', prompt: '고객이 "지금은 예산이 없어요"라고 할 때 효과적으로 응대하는 방법과 스크립트를 알려주세요.' },
  ],
  '회계팀장': [
    { id: 'monthly_summary', label: '월간 손익 요약', icon: '📊', prompt: '이번 달 수입/지출 현황을 바탕으로 손익 분석 리포트를 작성해주세요. 개선이 필요한 부분도 포함해서.' },
    { id: 'tax_calendar', label: '세금 일정 안내', icon: '📅', prompt: '1인 사업자/소상공인이 놓치면 안 되는 올해 주요 세금 신고 일정과 준비 사항을 알려주세요.' },
    { id: 'invoice', label: '인보이스 생성', icon: '🧾', prompt: '전문적인 세금계산서/인보이스 양식과 함께 작성 시 주의사항을 알려주세요.' },
    { id: 'expense_optimization', label: '비용 최적화', icon: '💡', prompt: '1인 기업이 절약할 수 있는 사업 비용 항목과 세금 혜택을 받을 수 있는 지출 방법을 알려주세요.' },
  ],
  '개발자': [
    { id: 'code_review', label: '코드 리뷰', icon: '🔍', prompt: '제가 작성한 코드의 문제점, 보안 이슈, 최적화 방법을 검토해주세요. 코드를 붙여넣어 주세요.' },
    { id: 'tech_doc', label: '기술 문서 작성', icon: '📝', prompt: '기술 문서(API 문서, README, 사용 가이드)를 전문적으로 작성하는 방법과 템플릿을 제공해주세요.' },
    { id: 'api_design', label: 'API 설계', icon: '🔌', prompt: 'RESTful API 설계 원칙과 best practice를 바탕으로 API 엔드포인트 구조를 설계해주세요.' },
    { id: 'bug_debug', label: '버그 디버깅', icon: '🐛', prompt: '발생한 버그의 원인 파악과 해결 방법을 단계별로 설명해주세요. 에러 메시지를 공유해주세요.' },
  ],
  'HR매니저': [
    { id: 'job_posting', label: '채용 공고 작성', icon: '📋', prompt: '매력적이고 구체적인 채용 공고를 작성해주세요. 역할, 자격요건, 혜택, 지원 방법 포함.' },
    { id: 'interview_questions', label: '면접 질문 준비', icon: '❓', prompt: '직무에 맞는 행동 면접 질문 10개와 좋은 답변 예시를 준비해주세요.' },
    { id: 'onboarding', label: '온보딩 체크리스트', icon: '✅', prompt: '신규 팀원의 첫 30일 온보딩 체크리스트와 일정을 작성해주세요.' },
    { id: 'performance_review', label: '성과 평가 템플릿', icon: '⭐', prompt: '공정하고 건설적인 성과 평가 양식과 피드백 작성 가이드를 제공해주세요.' },
  ],
  '고객지원': [
    { id: 'faq', label: 'FAQ 작성', icon: '❓', prompt: '고객이 자주 묻는 질문 10개와 친절한 답변을 작성해주세요.' },
    { id: 'complaint_response', label: '불만 고객 응대', icon: '🤝', prompt: '불만을 가진 고객을 효과적으로 응대하고 문제를 해결하는 스크립트와 방법을 알려주세요.' },
    { id: 'refund_policy', label: '환불 정책 작성', icon: '💳', prompt: '고객 친화적이면서도 사업자를 보호하는 환불/교환 정책을 작성해주세요.' },
    { id: 'survey', label: '만족도 조사 설계', icon: '📊', prompt: '고객 만족도 조사 질문지 5개를 작성하고 결과 분석 방법을 알려주세요.' },
  ],
  '전략기획': [
    { id: 'market_analysis', label: '시장 분석', icon: '🔍', prompt: '현재 시장 트렌드와 경쟁사 분석을 바탕으로 우리 비즈니스의 기회와 위협을 분석해주세요.' },
    { id: 'business_plan', label: '사업 계획서', icon: '📋', prompt: '3개월/6개월/12개월 비즈니스 목표와 달성 전략을 포함한 사업 계획서를 작성해주세요.' },
    { id: 'kpi_setup', label: 'KPI 설정', icon: '🎯', prompt: '우리 비즈니스 목표에 맞는 핵심 성과 지표(KPI) 5개를 설정하고 측정 방법을 알려주세요.' },
    { id: 'swot', label: 'SWOT 분석', icon: '⚡', prompt: '우리 사업의 강점(S), 약점(W), 기회(O), 위협(T)을 분석하고 전략적 시사점을 도출해주세요.' },
  ],
  '대표': [
    { id: 'vision', label: '비전/미션 수립', icon: '🌟', prompt: '회사의 장기 비전과 미션 선언문을 작성해주세요. 팀원과 고객 모두에게 영감을 주는 내용으로.' },
    { id: 'pitch_deck', label: '피치덱 구성', icon: '🎤', prompt: '투자자나 파트너에게 설명할 피치덱의 구성과 각 슬라이드 내용을 작성해주세요.' },
    { id: 'decision', label: '의사결정 프레임', icon: '🧭', prompt: '중요한 비즈니스 결정을 내릴 때 활용할 수 있는 의사결정 프레임워크를 제안해주세요.' },
    { id: 'okr', label: 'OKR 설정', icon: '🎯', prompt: '이번 분기 회사 OKR(목표와 핵심 결과)을 설정해주세요. 3개 목표, 각 3개 핵심 결과.' },
  ],
};

// 모든 역할에 공통 툴
const COMMON_TOOLS = [
  { id: 'summary', label: '요약', icon: '📌', prompt: '다음 내용을 핵심만 간결하게 요약해주세요:' },
  { id: 'translate', label: '번역', icon: '🌍', prompt: '다음 내용을 영어로 번역해주세요. 비즈니스 문서에 적합한 어조로:' },
  { id: 'proofread', label: '교정', icon: '✏️', prompt: '다음 문서의 맞춤법, 문법, 어색한 표현을 교정해주세요:' },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role') || '';

  const roleTools = ROLE_TOOLS[role] || [];
  const tools = [...COMMON_TOOLS, ...roleTools];

  return NextResponse.json({ tools, role });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { toolId, role, customInput, apiKey, provider = 'gemini', model } = body;

    const roleTools = ROLE_TOOLS[role] || [];
    const allTools = [...COMMON_TOOLS, ...roleTools];
    const tool = allTools.find((t) => t.id === toolId);

    if (!tool) {
      return NextResponse.json({ error: '툴을 찾을 수 없습니다' }, { status: 404 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 필요합니다' }, { status: 400 });
    }

    const prompt = customInput
      ? `${tool.prompt}\n\n${customInput}`
      : tool.prompt;

    let reply = '';

    if (provider === 'claude') {
      const selectedModel = model || 'claude-sonnet-4-6';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      reply = data.content?.[0]?.text || '';
    } else if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
      const selectedModel = model || (provider === 'gpt4o' ? 'gpt-4o' : provider === 'gpt4' ? 'gpt-4-turbo' : 'gpt-3.5-turbo');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
        }),
      });
      const data = await res.json();
      reply = data.choices?.[0]?.message?.content || '';
    } else {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const selectedModel = model || 'gemini-2.0-flash';
      const geminiModel = genAI.getGenerativeModel({ model: selectedModel });
      const result = await geminiModel.generateContent(prompt);
      reply = result.response.text();
    }

    return NextResponse.json({ reply, toolId, toolLabel: tool.label });
  } catch (error) {
    console.error('Tools error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
