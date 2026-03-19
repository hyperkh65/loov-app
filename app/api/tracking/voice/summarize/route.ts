import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 60;

async function getUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) {
    const { data } = await createAdminClient().auth.getUser(token);
    return data.user;
  }
  const { data } = await (await createClient()).auth.getUser();
  return data.user;
}

const PROMPT_TEMPLATE = (transcript: string) =>
  `다음 음성 메모를 분석해서 JSON으로 반환해줘:\n\n[음성 메모]\n${transcript}\n\n반드시 아래 JSON 형식만 출력:\n{"summary": "핵심 내용 2-3문장 요약", "scheduleItems": [{"title": "일정 제목", "date": "YYYY-MM-DD or 빈문자열", "time": "HH:MM or 빈문자열", "type": "meeting|task|deadline|call|review|other", "description": "상세내용"}]}`;

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { transcript, provider = 'gemini', memoId } = await req.json();
    if (!transcript) return NextResponse.json({ error: 'transcript 필요' }, { status: 400 });

    const prompt = PROMPT_TEMPLATE(transcript);

    if (provider === 'gpt') {
      // GPT-4o
      const openaiKey = process.env.OPENAI_API_KEY || await getSetting('OPENAI_API_KEY');
      if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY 없음' }, { status: 500 });

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `GPT 오류: ${err}` }, { status: 500 });
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(text);
      return NextResponse.json({
        summary: parsed.summary ?? '',
        scheduleItems: parsed.scheduleItems ?? [],
        memoId,
      });
    } else {
      // Gemini 1.5 Flash (default)
      const geminiKey = process.env.GEMINI_API_KEY || await getSetting('GEMINI_API_KEY');
      if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 없음' }, { status: 500 });

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from response (strip markdown code fences if present)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
      const jsonStr = (jsonMatch[1] ?? text).trim();
      const parsed = JSON.parse(jsonStr);

      return NextResponse.json({
        summary: parsed.summary ?? '',
        scheduleItems: parsed.scheduleItems ?? [],
        memoId,
      });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
