import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export interface ProductData {
    name: string;
    model?: string;
    specs?: string;
    price?: number;
    currency?: string;
    quantity?: number;
    category?: string;
    manufacturer?: string;
    image?: string;
    notes?: string;
}

export interface ClientData {
    clientName: string;
    businessNo: string;
    ceo: string;
    address: string;
    industry: string;
    type: string;
    email?: string;
    tel?: string;
    fax?: string;
}

export interface AIAnalysisResult {
    products: ProductData[];
    source: string;
    confidence: number;
    warnings: string[];
}

export interface AIBodyPart {
    data: string;
    mimeType: string;
}

const PRODUCT_EXTRACTION_PROMPT = `
당신은 제품 정보 추출 전문가입니다.
제공된 문서에서 모든 제품의 이름, 모델명, 규격, 단가, 수량 등을 추출하여 JSON으로 응답하세요.
{
  "products": [
    { "name": "", "model": "", "specs": "", "price": 0, "currency": "KRW", "quantity": 1, "category": "", "manufacturer": "", "notes": "" }
  ]
}
`;

const CLIENT_EXTRACTION_PROMPT = `
당신은 한국의 사업자등록증(법인/개인) 분석 전문가입니다.
제공된 문서(이미지 또는 PDF)에서 다음 정보를 정확하게 추출하여 JSON 형식으로만 응답하세요.

추출 항목:
1. clientName: 상호(법인명)
2. businessNo: 사업자등록번호 (예: 000-00-00000)
3. ceo: 대표자 성명
4. address: 사업장 소재지 (전체 주소)
5. industry: 업태
6. type: 종목
7. email: 문서 내 이메일 주소 (없으면 빈칸)
8. tel: 전화번호 (없으면 빈칸)
9. fax: 팩스번호 (없으면 빈칸)
`;

async function callGemini(text: string, parts: AIBodyPart[], isClient: boolean): Promise<any> {
    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-exp'];
    let lastError: any = null;

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: 'application/json' }
            });

            const contents: any[] = [
                { text: isClient ? CLIENT_EXTRACTION_PROMPT : PRODUCT_EXTRACTION_PROMPT },
                { text: `Background context: ${text}` }
            ];

            parts.forEach(part => {
                contents.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
            });

            const result = await model.generateContent(contents);
            const response = await result.response;
            return JSON.parse(response.text().trim());
        } catch (err: any) {
            lastError = err;
            if (err.message.includes('404')) continue;
            throw err;
        }
    }
    throw lastError || new Error('All Gemini models failed');
}

export async function extractWithGPT(text: string, parts: AIBodyPart[], isClient = false): Promise<any> {
    const messages: any[] = [{ role: 'system', content: isClient ? CLIENT_EXTRACTION_PROMPT : PRODUCT_EXTRACTION_PROMPT }];
    const userContent: any[] = [{ type: 'text', text: `Document Text: ${text}` }];

    parts.forEach(part => {
        if (part.mimeType.startsWith('image/')) {
            userContent.push({ type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.data}` } });
        }
    });

    messages.push({ role: 'user', content: userContent });
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
    });
    return JSON.parse(completion.choices[0].message.content || '{}');
}

export async function extractProducts(text: string, attachments: any[] = []): Promise<AIAnalysisResult> {
    const parts = normalizeParts(attachments);
    try {
        const data = await callGemini(text, parts, false);
        return { products: data.products || [], source: 'gemini', confidence: 0.9, warnings: [] };
    } catch (e) {
        try {
            const data = await extractWithGPT(text, parts, false);
            return { products: data.products || [], source: 'gpt', confidence: 0.8, warnings: [] };
        } catch (e2) {
            return { products: [], source: 'error', confidence: 0, warnings: ['AI 분석 실패'] };
        }
    }
}

export async function extractClientInfo(text: string, attachments: any[] = []): Promise<ClientData> {
    const parts = normalizeParts(attachments);
    try {
        const data = await callGemini(text, parts, true);
        if (!data.clientName && !data.businessNo && !data.ceo) {
            throw new Error('AI could not find meaningful business info.');
        }
        return data;
    } catch (e) {
        try {
            return await extractWithGPT(text, parts, true);
        } catch (e2) {
            throw new Error('사업자등록증을 분석할 수 없습니다. 수동으로 입력해 주세요.');
        }
    }
}

function normalizeParts(attachments: any[]): AIBodyPart[] {
    if (!attachments || attachments.length === 0) return [];
    if (typeof attachments[0] === 'string') {
        return (attachments as string[]).map(data => ({ data, mimeType: 'image/jpeg' }));
    }
    return attachments as AIBodyPart[];
}

export async function detectDuplicates(newProducts: ProductData[], existingProducts: any[]): Promise<Map<number, any[]>> {
    const duplicates = new Map<number, any[]>();
    for (let i = 0; i < newProducts.length; i++) {
        const newProd = newProducts[i];
        const matches = existingProducts.filter(existing => existing.name?.includes(newProd.name));
        if (matches.length > 0) duplicates.set(i, matches);
    }
    return duplicates;
}
