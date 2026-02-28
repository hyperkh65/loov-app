import { NextRequest, NextResponse } from 'next/server';
import { Role, AnimalType } from '@/lib/types';

const ANIMAL_KO: Record<AnimalType, string> = {
  pig: 'pig', cat: 'cat', rabbit: 'rabbit', fox: 'fox', otter: 'otter',
  tiger: 'tiger', deer: 'deer', elephant: 'elephant', monkey: 'monkey',
};

const ROLE_DETAIL: Record<string, string> = {
  '대표':               'wearing a CEO suit, holding a smartphone, confident expression',
  '영업팀장':           'holding a presentation tablet, wearing sharp business suit',
  '회계팀장':           'holding a clipboard with spreadsheets, wearing glasses',
  '마케터':             'holding a microphone, energetic pose',
  '개발자':             'holding a laptop, wearing casual blazer over hoodie',
  '디자이너':           'holding color swatches, wearing stylish glasses',
  'HR매니저':           'holding a clipboard, warm friendly expression',
  '고객지원':           'wearing a headset, friendly expression',
  '전략기획':           'holding a strategic plan document, thoughtful expression',
  // 하위 호환
  '상무':               'holding a golden conductor baton, wearing a gold laurel crown',
  'Creative Director':  'wearing a beret, holding a paint palette and brush',
  'Accountant':         'holding a clipboard with spreadsheets, wearing glasses',
  'Marketer':           'holding a microphone, energetic pose',
  'Developer':          'holding a laptop, wearing casual blazer over hoodie',
  'Designer':           'holding color swatches, wearing stylish glasses',
  'HR':                 'holding a clipboard, warm friendly expression',
};

export async function POST(req: NextRequest) {
  try {
    const { animal, role, name } = await req.json();

    const animalEn = ANIMAL_KO[animal as AnimalType] || animal;
    const roleDetail = ROLE_DETAIL[role as Role] || '';

    const prompt = `A cute adorable 3D Pixar-style cartoon character: a ${animalEn} wearing a sharp professional business suit and tie. The character is ${roleDetail}. UPPER BODY PORTRAIT — close-up bust shot showing face, neck, shoulders and chest only, camera close and centered on face, slight 3/4 angle view, cheerful confident expression. PURE WHITE BACKGROUND — absolutely no shadows, no ground, no environment, no gradients, no background elements whatsoever. Character head and shoulders isolated on pure solid white (#FFFFFF). High quality 3D render, Pixar cartoon style, vibrant saturated colors, soft studio lighting. Character name: ${name}.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);

    if (!imgPart?.inlineData) {
      return NextResponse.json({ error: '이미지 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({
      imageData: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`,
    });
  } catch (error) {
    console.error('Character generation error:', error);
    return NextResponse.json({ error: '이미지 생성 실패' }, { status: 500 });
  }
}
