import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_BASE = 'https://api.notion.com/v1';

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path: pathParts } = await params;
    const path = pathParts[0];
    const body = await req.json();
    const NOTION_TOKEN = process.env.NOTION_API_KEY;

    if (!NOTION_TOKEN) {
        return NextResponse.json({
            error: 'NOTION_API_KEY가 설정되지 않았습니다.'
        }, { status: 500 });
    }

    let url = '';
    let method = 'POST';

    switch (path) {
        case 'query':
            url = `${NOTION_API_BASE}/databases/${body.db}/query`;
            delete body.db;
            break;
        case 'create':
            url = `${NOTION_API_BASE}/pages`;
            if (body.db) {
                body.parent = { database_id: body.db };
                delete body.db;
            }
            break;
        case 'update':
            url = `${NOTION_API_BASE}/pages/${body.pageId}`;
            method = 'PATCH';
            delete body.pageId;
            break;
        case 'delete':
            url = `${NOTION_API_BASE}/pages/${body.pageId}`;
            method = 'PATCH';
            body.archived = true;
            delete body.pageId;
            break;
        default:
            return NextResponse.json({ error: '지원하지 않는 경로: ' + path }, { status: 400 });
    }

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
