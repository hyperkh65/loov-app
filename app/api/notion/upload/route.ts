import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client as NotionClient } from '@notionhq/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_TEXT_CHARS = 12_000;
const NOTION_CHUNK = 1_900;
const NOTION_MAX_BLOCKS = 50;

const CATEGORIES = [
  '계약서', '보고서', '회의록', '청구서/영수증',
  '기획서', '이력서', '매뉴얼', '데이터/통계', '기타',
];

function detectFileType(name: string, mime: string): 'PDF' | 'Word' | 'Excel' | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (['doc', 'docx'].includes(ext) || mime.includes('word') || mime.includes('officedocument.wordprocessingml')) return 'Word';
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return 'Excel';
  return null;
}

async function extractText(buffer: Buffer, fileType: 'PDF' | 'Word' | 'Excel'): Promise<string> {
  if (fileType === 'PDF') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text ?? '';
  }
  if (fileType === 'Word') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }
  if (fileType === 'Excel') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const lines: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      lines.push(`[시트: ${sheetName}]`);
      lines.push(XLSX.utils.sheet_to_csv(ws));
    }
    return lines.join('\n');
  }
  return '';
}

async function classifyWithAI(
  text: string,
  fileName: string,
  provider: string,
  apiKey: string
): Promise<{ title: string; category: string; summary: string; tags: string[] }> {
  const truncated = text.slice(0, MAX_TEXT_CHARS);
  const prompt = `다음 문서를 분석하여 JSON 형식으로 응답하세요.

파일명: ${fileName}
내용 (앞부분):
${truncated}

응답 형식 (JSON만, 다른 텍스트 없이):
{
  "title": "문서의 핵심 제목 (30자 이내)",
  "category": "${CATEGORIES.join(' | ')} 중 하나",
  "summary": "문서 내용 3~5문장 요약",
  "tags": ["태그1", "태그2", "태그3"] // 최대 5개
}`;

  const key = apiKey || process.env.GEMINI_API_KEY || '';

  // Currently supporting gemini as primary AI (matching project pattern)
  if (provider === 'gemini' || !provider || provider === 'claude' || provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    if (key) {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      return JSON.parse(jsonStr);
    }
  }

  // Fallback: simple heuristic
  return {
    title: fileName.replace(/\.[^/.]+$/, '').slice(0, 30),
    category: '기타',
    summary: '(AI 키가 없어 자동 요약을 생성하지 못했습니다.)',
    tags: [],
  };
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < NOTION_MAX_BLOCKS; i += NOTION_CHUNK) {
    chunks.push(text.slice(i, i + NOTION_CHUNK));
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get Notion config
  const { data: settingsRow } = await supabase
    .from('bossai_company_settings')
    .select('notion_config')
    .eq('user_id', user.id)
    .single();

  const notionConfig = settingsRow?.notion_config ?? {};
  if (!notionConfig.apiKey || !notionConfig.databaseId) {
    return NextResponse.json({ error: 'Notion API 키와 DB ID를 먼저 설정해주세요.' }, { status: 400 });
  }

  // Parse FormData
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const provider = (formData.get('provider') as string) ?? 'gemini';
  const aiApiKey = (formData.get('aiApiKey') as string) ?? '';

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다.' }, { status: 400 });

  const fileType = detectFileType(file.name, file.type);
  if (!fileType) return NextResponse.json({ error: '지원하지 않는 파일 형식입니다. PDF, Word, Excel만 가능합니다.' }, { status: 400 });

  // Create upload record (pending)
  const { data: uploadRow, error: insertError } = await supabase
    .from('bossai_notion_uploads')
    .insert({
      user_id: user.id,
      original_name: file.name,
      file_type: fileType,
      status: 'processing',
    })
    .select('id')
    .single();

  if (insertError || !uploadRow) {
    return NextResponse.json({ error: '업로드 기록 생성 실패' }, { status: 500 });
  }

  const uploadId = uploadRow.id;

  try {
    // Extract text
    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractText(buffer, fileType);
    const text = rawText.trim();

    // AI classification
    const aiResult = await classifyWithAI(text, file.name, provider, aiApiKey);

    // Notion: create DB row
    const notion = new NotionClient({ auth: notionConfig.apiKey });
    const today = new Date().toISOString().split('T')[0];

    const page = await notion.pages.create({
      parent: { database_id: notionConfig.databaseId },
      properties: {
        Name: { title: [{ text: { content: aiResult.title } }] },
        카테고리: { select: { name: aiResult.category } },
        파일명: { rich_text: [{ text: { content: file.name } }] },
        유형: { select: { name: fileType } },
        요약: { rich_text: [{ text: { content: aiResult.summary.slice(0, 2000) } }] },
        태그: { multi_select: aiResult.tags.map((t) => ({ name: t })) },
        날짜: { date: { start: today } },
      },
    });

    // Notion: append original text as child blocks
    if (text) {
      const chunks = chunkText(text);
      await notion.blocks.children.append({
        block_id: page.id,
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: { rich_text: [{ text: { content: '원문 내용' } }] },
          },
          ...chunks.map((chunk) => ({
            object: 'block' as const,
            type: 'paragraph' as const,
            paragraph: { rich_text: [{ text: { content: chunk } }] },
          })),
        ],
      });
    }

    // Update upload record to done
    await supabase
      .from('bossai_notion_uploads')
      .update({
        category: aiResult.category,
        ai_title: aiResult.title,
        summary: aiResult.summary,
        tags: aiResult.tags,
        notion_page_id: page.id,
        notion_db_row_id: page.id,
        status: 'done',
      })
      .eq('id', uploadId);

    return NextResponse.json({
      success: true,
      uploadId,
      title: aiResult.title,
      category: aiResult.category,
      summary: aiResult.summary,
      tags: aiResult.tags,
      notionPageId: page.id,
      notionUrl: `https://www.notion.so/${page.id.replace(/-/g, '')}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from('bossai_notion_uploads')
      .update({ status: 'error', error_message: msg.slice(0, 500) })
      .eq('id', uploadId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
