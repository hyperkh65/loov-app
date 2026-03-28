import { NextRequest, NextResponse } from 'next/server';
import { analyzeWatermarks, cleanWatermarks } from '@/lib/ai-watermark';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json() as { text: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: '텍스트가 없습니다' }, { status: 400 });
    }

    const analysis = analyzeWatermarks(text);
    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { text } = await req.json() as { text: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: '텍스트가 없습니다' }, { status: 400 });
    }
    return NextResponse.json({ cleanedText: cleanWatermarks(text) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
