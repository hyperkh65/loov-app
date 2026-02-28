import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { ANIMAL_PERSONALITY, AnimalType } from '@/lib/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { employee, topic, meetingHistory, userMessage } = await req.json();

    const otherNames = [...new Set(
      (meetingHistory || [])
        .filter((m: { from: string; fromName: string }) => m.from !== 'user' && m.from !== employee.id && m.fromName)
        .map((m: { fromName: string }) => m.fromName)
    )];

    const historyText = (meetingHistory || [])
      .slice(-12)
      .map((m: { from: string; fromName: string; content: string }) =>
        m.from === 'user' ? `사회자: ${m.content}` : `[${m.fromName}] ${m.content}`
      )
      .join('\n');

    const prompt = `당신은 "${employee.name}" (${employee.role})입니다.
성격: ${ANIMAL_PERSONALITY[employee.animal as AnimalType]}
지금 그룹 회의 주제: "${topic}"
${otherNames.length > 0 ? `다른 참석자: ${otherNames.join(', ')}` : ''}

당신의 직책과 성격에 맞게 발언하세요. 2-3문장으로 간결하게. 한국어로.

${historyText ? `[회의 내용]\n${historyText}\n\n` : ''}${employee.name}의 발언:`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Meeting error:', error);
    return NextResponse.json({ error: '응답 생성 실패' }, { status: 500 });
  }
}
