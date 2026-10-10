import { NextRequest, NextResponse } from 'next/server';
import { checkAndIncrementUsage } from '@/lib/ai-usage';
import { callAI, type AIMessage } from '@/lib/ai-call';

const ROLE_CONTEXT: Record<string, string> = {
  '영업팀장': '고객 발굴, 영업 전략, 제안서 작성, CRM 관리, 계약 협상 전문가.',
  '회계팀장': '재무제표, 세무신고, 예산 관리, 손익 분석, 인보이스 전문가.',
  '마케터':   'SNS 마케팅, 콘텐츠 제작, 광고 집행, 브랜딩, 데이터 분석 전문가.',
  '개발자':   '웹 개발, API 연동, 시스템 자동화, 기술 아키텍처 전문가.',
  '디자이너': 'UI/UX 설계, 브랜딩, 홍보물 제작, 비주얼 아이덴티티 전문가.',
  'HR매니저': '채용, 인사 관리, 조직 문화, 급여 관리, 성과 평가 전문가.',
  '고객지원': '고객 응대, CS 처리, 만족도 관리, 불만 해결 전문가.',
  '전략기획': '시장 분석, 사업 계획, 경쟁사 분석, KPI 관리, 사업 개발 전문가.',
  '대표':     '회사 경영 전반, 의사결정, 전략 수립, 투자 유치 담당.',
  // 하위 호환
  '상무':               '회사 전략, 팀 조율, 경영 전반 담당. 팀원들에게 방향을 제시하는 임원.',
  'Creative Director':  '브랜딩, 캠페인 기획, 크리에이티브 디렉션 담당.',
  'Accountant':         '예산 관리, 재무 분석, 비용 최적화 담당.',
  'Marketer':           '마케팅 전략, 광고 카피, 콘텐츠 기획 담당.',
  'Developer':          '소프트웨어 개발, 코드 리뷰, 기술 아키텍처 담당.',
  'Designer':           'UI/UX 디자인, 비주얼 아이덴티티, 사용자 경험 담당.',
  'HR':                 '채용, 인사 관리, 조직 문화, 온보딩 담당.',
};

export async function POST(req: NextRequest) {
  try {
    // AI 사용량 체크 (마스터는 무제한)
    const usage = await checkAndIncrementUsage();
    if (!usage.allowed) {
      return NextResponse.json(
        { error: `일일 AI 사용 한도(${usage.limit}회)에 도달했습니다. 내일 다시 이용하거나 플랜을 업그레이드하세요.`, limitReached: true },
        { status: 429 }
      );
    }

    const body = await req.json();

    // 두 가지 API 형식 지원 (기존 + 새 대시보드)
    const {
      // 새 형식
      employeeName,
      employeeRole,
      employeePersonality,
      message,
      history,
      companyName,
      ceoName,
      apiKey,
      // 커스터마이징
      customInstructions,
      companyBio,
      responseLanguage,
      responseLength,
      globalCustomInstructions,
      // 기존 형식
      employee,
      userMessage,
      chatHistory,
    } = body;

    const name = employeeName || employee?.name || '직원';
    const role = employeeRole || employee?.role || '';
    const personality = employeePersonality || '';
    const userMsg = message || userMessage || '';
    const msgs = history || chatHistory || [];
    const company = companyName || 'My Company';
    const ceo = ceoName || '대표님';
    const provider: string = body.provider || 'gemini';
    const model: string = body.model || '';
    const roleCtx = ROLE_CONTEXT[role] || `${role} 담당 직원.`;

    // 서버 환경변수를 fallback으로 사용 (클라이언트 키 없거나 빈 값일 때)
    const resolvedApiKey: string = apiKey || '';
    const resolvedProvider = provider;

    const historyText = msgs
      .slice(-12)
      .map((m: { from: string; content: string }) =>
        m.from === 'user' ? `${ceo}: ${m.content}` : `${name}: ${m.content}`
      )
      .join('\n');

    // 응답 언어 지시
    const langMap: Record<string, string> = {
      ko:   '반드시 한국어로 답변하세요.',
      en:   'Always respond in English.',
      auto: '사용자 메시지와 동일한 언어로 답변하세요.',
    };
    const langInstruction = langMap[responseLanguage || 'ko'];

    // 응답 길이 지시
    const lengthMap: Record<string, string> = {
      concise:  '간결하게 2~4문장으로 핵심만 답변하세요.',
      normal:   '적절한 길이로 명확하게 답변하세요.',
      detailed: '충분한 설명과 예시를 포함하여 상세하게 답변하세요.',
    };
    const lengthInstruction = lengthMap[responseLength || 'concise'];

    const systemPrompt = [
      `당신은 "${company}"에서 일하는 AI 직원 "${name}"입니다.`,
      `직책: ${role} — ${roleCtx}`,
      personality ? `성격: ${personality}` : '',
      `대표자: ${ceo}`,
      companyBio ? `\n[회사 소개]\n${companyBio}` : '',
      `\n[기본 지시사항]`,
      `- 위 직책에 맞는 전문 지식과 관점으로 답변하세요`,
      `- ${langInstruction}`,
      `- ${lengthInstruction}`,
      `- 당신이 AI라는 것을 드러내지 마세요`,
      `- 대표님의 지시에 적극적으로 협력하세요`,
      `- 업무 관련 조언, 분석, 문서 작성 등을 수행하세요`,
      globalCustomInstructions ? `\n[전체 공통 지시]\n${globalCustomInstructions}` : '',
      customInstructions ? `\n[${name} 개인 지시]\n${customInstructions}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `${historyText ? `[이전 대화]\n${historyText}\n\n` : ''}${ceo}: ${userMsg}
${name}:`;

    // Build messages array for callAI
    const aiMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    // Call AI with fallback support; pass explicit key only if provided
    const aiResult = await callAI({
      messages: aiMessages,
      provider: resolvedProvider,
      model: model || undefined,
      apiKey: resolvedApiKey || undefined,
      maxTokens: 500,
      useFallback: true,
    });

    return NextResponse.json({
      reply: aiResult.text,
      provider: aiResult.provider,
      model: aiResult.model,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Chat error:', errMsg);
    return NextResponse.json({
      reply: `죄송합니다. 오류가 발생했습니다: ${errMsg}`,
    });
  }
}
