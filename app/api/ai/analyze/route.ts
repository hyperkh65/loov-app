import { NextRequest, NextResponse } from 'next/server';
import { extractProducts, extractClientInfo } from '@/lib/aiService';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const text = formData.get('text') as string;
        const imagesStr = formData.get('images') as string;
        const analysisType = formData.get('type') as string;

        let attachments: { data: string, mimeType: string }[] = [];

        if (file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Data = buffer.toString('base64');

                let mimeType = file.type;
                if (!mimeType || mimeType === 'application/octet-stream') {
                    if (file.name.endsWith('.pdf')) mimeType = 'application/pdf';
                    else if (file.name.match(/\.(jpg|jpeg)$/i)) mimeType = 'image/jpeg';
                    else if (file.name.endsWith('.png')) mimeType = 'image/png';
                }

                attachments.push({ data: base64Data, mimeType });
            } catch (e) {
                console.error('File read failed:', e);
            }
        }

        if (imagesStr) {
            try {
                const parsedImages: string[] = JSON.parse(imagesStr);
                parsedImages.forEach(imgData => {
                    attachments.push({ data: imgData, mimeType: 'image/jpeg' });
                });
            } catch (e) {
                console.error('JSON Parse Error for images:', e);
            }
        }

        if (attachments.length === 0 && !text) {
            return NextResponse.json({ error: '분석할 파일이나 텍스트가 없습니다.' }, { status: 400 });
        }

        if (analysisType === 'client') {
            try {
                const result = await extractClientInfo(text || '', attachments);
                return NextResponse.json(result);
            } catch (error: any) {
                return NextResponse.json({ error: `AI 분석 에러: ${error.message}` }, { status: 500 });
            }
        } else {
            try {
                const result = await extractProducts(text || '', attachments);
                return NextResponse.json(result);
            } catch (aiError: any) {
                return NextResponse.json({ error: `AI 분석 에러: ${aiError.message}` }, { status: 500 });
            }
        }
    } catch (error: any) {
        return NextResponse.json({ error: `서버 내부 오류: ${error.message}` }, { status: 500 });
    }
}
