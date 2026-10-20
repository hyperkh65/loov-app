import { NextResponse } from 'next/server';

// Custom GPT의 Action 설정에 붙여 넣거나 URL로 가져가는 스키마
export function GET() {
  return NextResponse.json({
    openapi: '3.1.0',
    info: { title: '2days TOP10 → 딸깍', version: '1.0.0', description: '검증이 끝난 TOP10 JSON을 딸깍 영상 제작 대기열로 보낸다.' },
    servers: [{ url: 'https://loov.co.kr' }],
    paths: {
      '/api/top10-inbox': {
        post: {
          operationId: 'sendTop10ToDdalkak',
          summary: '검증 끝난 TOP10 JSON을 딸깍으로 보낸다',
          description: '답변의 ⑤ JSON과 똑같은 객체를 data에 그대로 넣어 보낸다. 한 JSON당 한 번만 호출한다.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['data'], properties: { data: { type: 'object', description: 'TOP10 JSON (id, title, kicker, sub, source, sources, intro, outro, caption, tags, theme, scene, rows[name,value,note,say,img])', additionalProperties: true } } } } } },
          responses: { '200': { description: '전달됨', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' }, duplicate: { type: 'boolean' }, message: { type: 'string' } } } } } }, '400': { description: '형식 오류' }, '401': { description: '키 오류' } },
        },
      },
    },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas: {} },
    security: [{ bearerAuth: [] }],
  });
}
