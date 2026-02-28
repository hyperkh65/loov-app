import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { ANIMAL_PERSONALITY, AnimalType } from '@/lib/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { sanmu, employees, projects, recentMessages } = await req.json();

    const teamList = (employees || []).map((e: { name: string; role: string }) => `- ${e.name} (${e.role})`).join('\n');
    const projectList = (projects || []).map((p: { name: string; status: string; description: string }) =>
      `- [${p.status}] ${p.name}: ${p.description}`
    ).join('\n');
    const activityLog = (recentMessages || []).map((m: { employeeName: string; content: string }) =>
      `- ${m.employeeName}: "${m.content.slice(0, 80)}..."`
    ).join('\n');

    const prompt = `당신은 "${sanmu.name}" 상무입니다.
성격: ${ANIMAL_PERSONALITY[sanmu.animal as AnimalType]}

오늘의 팀 현황을 바탕으로 대표에게 보고하는 일일 보고서를 작성해주세요.

[팀원 현황]
${teamList || '팀원 없음'}

[진행 중인 프로젝트]
${projectList || '프로젝트 없음'}

[오늘의 주요 활동]
${activityLog || '활동 기록 없음'}

상무로서 오늘 하루를 총평하고 내일의 방향을 제시해주세요.
당신의 성격이 담긴 말투로, [총평], [팀원별 현황], [프로젝트 현황], [내일의 방향] 섹션으로 구성하세요.
보고 대상은 대표입니다.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const report = result.response.text();

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Orchestrate error:', error);
    return NextResponse.json({ error: '보고서 생성 실패' }, { status: 500 });
  }
}
