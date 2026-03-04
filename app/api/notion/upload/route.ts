import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { Client as NotionClient } from '@notionhq/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_TEXT_CHARS = 12_000;
const NOTION_CHUNK = 1_900;
const NOTION_MAX_BLOCKS = 50;
const STORAGE_BUCKET = 'notion-uploads';

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
    const { getDocumentProxy, extractText } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text ?? '';
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
  "tags": ["태그1", "태그2", "태그3"]
}`;

  const key = apiKey || process.env.GEMINI_API_KEY || '';
  if (key) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      return JSON.parse(jsonStr);
    } catch {
      // fallthrough to heuristic
    }
  }

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

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣._\-\s]/g, '_');
}

/** Notion File Upload API — 파일을 Notion에 직접 업로드하여 file_upload_id 반환 */
async function uploadFileToNotion(
  notionApiKey: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  try {
    // Step 1: 업로드 초기화
    const initRes = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: fileName }),
    });
    if (!initRes.ok) {
      console.error('Notion file upload init failed:', await initRes.text());
      return null;
    }
    const { id: fileUploadId } = await initRes.json() as { id: string };

    // Step 2: 파일 바이너리 전송
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' });
    const form = new FormData();
    form.append('file', blob, fileName);

    const sendRes = await fetch(`https://api.notion.com/v1/file_uploads/${fileUploadId}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        'Notion-Version': '2022-06-28',
      },
      body: form,
    });
    if (!sendRes.ok) {
      console.error('Notion file upload send failed:', await sendRes.text());
      return null;
    }
    return fileUploadId;
  } catch (e) {
    console.error('Notion file upload error:', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

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

  // Create upload record
  const { data: uploadRow, error: insertError } = await supabase
    .from('bossai_notion_uploads')
    .insert({
      user_id: user.id,
      original_name: file.name,
      file_type: fileType,
      file_size: file.size,
      status: 'processing',
    })
    .select('id')
    .single();

  if (insertError || !uploadRow) {
    return NextResponse.json({ error: '업로드 기록 생성 실패' }, { status: 500 });
  }

  const uploadId = uploadRow.id;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Upload file to Supabase Storage
    const storagePath = `${user.id}/${uploadId}/${safeName(file.name)}`;
    const { error: storageError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    let fileUrl = '';
    if (!storageError) {
      const { data: urlData } = admin.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);
      fileUrl = urlData.publicUrl;
    }

    // 2. Extract text
    const rawText = await extractText(buffer, fileType);
    const text = rawText.trim();

    // 3. AI classification
    const aiResult = await classifyWithAI(text, file.name, provider, aiApiKey);

    // 4. Notion: create DB row
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

    // 5. Notion: 파일 직접 업로드 (File Upload API)
    const notionFileUploadId = await uploadFileToNotion(
      notionConfig.apiKey,
      buffer,
      file.name,
      file.type || 'application/octet-stream',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childBlocks: any[] = [];

    // 실제 파일 첨부 블록
    childBlocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: '📎 원본 파일' } }] },
    });

    if (notionFileUploadId) {
      // Notion에 직접 저장된 파일 (file_upload 타입)
      childBlocks.push({
        object: 'block',
        type: 'file',
        file: {
          type: 'file_upload',
          file_upload: { id: notionFileUploadId },
        },
      });
    } else if (fileUrl) {
      // 폴백: Supabase Storage 외부 링크
      childBlocks.push({
        object: 'block',
        type: 'file',
        file: {
          type: 'external',
          external: { url: fileUrl },
          name: file.name,
        },
      });
    }

    childBlocks.push({ object: 'block', type: 'divider', divider: {} });

    // Original text blocks
    if (text) {
      childBlocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '📄 원문 내용' } }] },
      });
      chunkText(text).forEach((chunk) => {
        childBlocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ text: { content: chunk } }] },
        });
      });
    }

    if (childBlocks.length > 0) {
      await notion.blocks.children.append({ block_id: page.id, children: childBlocks });
    }

    // 6. Update upload record
    await supabase
      .from('bossai_notion_uploads')
      .update({
        category: aiResult.category,
        ai_title: aiResult.title,
        summary: aiResult.summary,
        tags: aiResult.tags,
        notion_page_id: page.id,
        notion_db_row_id: page.id,
        file_url: fileUrl,
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
      fileUrl,
      fileType,
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
