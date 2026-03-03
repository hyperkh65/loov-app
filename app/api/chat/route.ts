import { NextRequest, NextResponse } from 'next/server';

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
    // provider가 gemini가 아닌데 키가 없으면, gemini로 전환해서 서버 키 사용
    let resolvedApiKey = apiKey;
    let resolvedProvider = provider;
    if (!resolvedApiKey) {
      resolvedApiKey = process.env.GEMINI_API_KEY;
      resolvedProvider = 'gemini';
    }

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

    if (!resolvedApiKey) {
      // API 키 없을 때 기본 응답
      const defaults: Record<string, string[]> = {
        '영업팀장': ['네, 바로 영업 전략을 수립하겠습니다!', '리드 발굴을 시작하겠습니다. 타겟 고객층을 알려주시면 더 정확한 접근이 가능합니다.'],
        '회계팀장': ['회계 처리를 진행하겠습니다.', '재무 현황을 분석하고 보고드리겠습니다.'],
        '마케터':   ['SNS 콘텐츠를 기획하겠습니다!', '마케팅 캠페인 아이디어를 제안드릴게요.'],
      };
      const empDefaults = defaults[role] || ['네, 처리하겠습니다.', '바로 진행하겠습니다.'];
      return NextResponse.json({
        reply: empDefaults[Math.floor(Math.random() * empDefaults.length)] + ' (AI 키를 설정하면 실제 AI 응답을 받을 수 있습니다.)',
      });
    }

    let reply = '';

    // OpenAI 계열 (gpt4o, gpt4, gpt35)
    if (resolvedProvider === 'gpt4o' || resolvedProvider === 'gpt4' || resolvedProvider === 'gpt35') {
      const selectedModel = model || (provider === 'gpt4o' ? 'gpt-4o' : provider === 'gpt4' ? 'gpt-4-turbo' : 'gpt-3.5-turbo');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resolvedApiKey}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'OpenAI API 오류');
      reply = data.choices?.[0]?.message?.content?.trim() || '';

    // Claude (Anthropic)
    } else if (resolvedProvider === 'claude') {
      const selectedModel = model || 'claude-sonnet-4-6';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': resolvedApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Anthropic API 오류');
      reply = data.content?.[0]?.text?.trim() || '';

    // Gemini (Google)
    } else {
      const selectedModel = model || 'gemini-2.0-flash';
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(resolvedApiKey);
      const geminiModel = genAI.getGenerativeModel({ model: selectedModel });
      const result = await geminiModel.generateContent(systemPrompt + '\n\n' + prompt);
      reply = result.response.text().trim();
    }

    return NextResponse.json({ reply });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Chat error:', errMsg);
    return NextResponse.json({
      reply: `죄송합니다. 오류가 발생했습니다: ${errMsg}`,
    });
  }
}
