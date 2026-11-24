import { NextRequest, NextResponse } from 'next/server';
import { authorized, GUIDE, RISK_NOTES, needsRiskNotes } from '@/lib/gpt-bridge';
import { runGptAction } from '@/lib/gpt-actions';

export const maxDuration = 120;

const draftProps = {
  keyword: { type: 'string', description: '메인 키워드' },
  title: { type: 'string', description: '글 제목(24~40자, 롱테일 키워드 + 구체적 상황 + 숫자 + 궁금증 포인트, 막연한 제목 저장 거부)' },
  meta_description: { type: 'string', description: '메타 설명(100~160자)' },
  content_html: { type: 'string', description: '본문 HTML 조각(<h1>/<body> 없이). 표·링크·이미지(합계 3장 이상) 포함. 직접 만든 이미지는 <img src="{{file:2}}">처럼 openaiFileIdRefs 순번으로 넣는다' },
  featured_image_url: { type: 'string', description: '대표이미지 URL (직접 만든 이미지는 openaiFileIdRefs로)' },
  attachments: { type: 'array', description: '관련 양식/자료 파일(pdf,hwp,docx,xlsx 등). 올려도 되는지 직접 페이지를 열어 판단한 것만', items: { type: 'object', properties: { url: { type: 'string', description: '파일 직접 주소' }, name: { type: 'string' }, source_page_url: { type: 'string', description: '파일이 있던 페이지' }, permission_note: { type: 'string', description: '올려도 되는 근거 한 줄' } } } },
  openaiFileIdRefs: { type: 'array', description: '생성/첨부한 이미지 파일. 첫 번째가 대표이미지', items: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'string' }, mime_type: { type: 'string' }, download_link: { type: 'string' } } } },
};
const post = (id: string, summary: string, properties: object, required: string[]) => ({
  post: { operationId: id, summary, 'x-openai-isConsequential': false, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } } }, responses: { '200': { description: 'OK' } } },
});
const SPEC = {
  openapi: '3.1.0',
  info: { title: 'LOOV 블로그 작성 브리지', version: '1.0.0', description: '키워드 리서치, 형태 검사, 초안 저장' },
  servers: [{ url: 'https://loov.co.kr' }],
  paths: {
    '/api/gpt/guide': { get: { operationId: 'getWritingGuide', summary: '작성 지침 받기. 글 시작 전에 반드시 호출', 'x-openai-isConsequential': false, parameters: [{ name: 'keyword', in: 'query', required: false, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/api/gpt/research': post('researchKeyword', '연관·롱테일 키워드와 월간 검색량·경쟁도, 네이버 상위 글/블로그/뉴스/지식인 주소, 스톡 이미지 후보', { keyword: { type: 'string' }, image_query_en: { type: 'string', description: '스톡 이미지 후보가 필요할 때 영어 검색어' } }, ['keyword']),
    '/api/gpt/page': post('readPage', '웹페이지 본문 텍스트와 이미지 주소 읽기(직접 브라우징이 막힐 때 백업)', { url: { type: 'string' } }, ['url']),
    '/api/gpt/validate': post('validateDraft', '초안의 형태 검사. errors가 비어야 저장 가능', draftProps, ['title', 'content_html']),
    '/api/gpt/draft': post('saveDraft', '검사 통과한 글을 초안으로 저장(이미지 재호스팅 포함). article_id를 주면 그 초안을 수정', { ...draftProps, article_id: { type: 'string' } }, ['keyword', 'title', 'meta_description', 'content_html']),
  },
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action === 'openapi') return NextResponse.json(SPEC);
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (action === 'guide') {
    const kw = req.nextUrl.searchParams.get('keyword') || '';
    return NextResponse.json({ guide: GUIDE + (needsRiskNotes(kw) ? '\n\n' + RISK_NOTES : '') });
  }
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = await runGptAction(action, b);
  return NextResponse.json(r.body, { status: r.status });
}
