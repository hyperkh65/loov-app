import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, filter, location, metadata, notionDbId } = await req.json();

    if (!imageBase64) return NextResponse.json({ error: '이미지 없음' }, { status: 400 });

    // 1. Upload to Cloudinary
    let cloudinaryUrl = '';
    let cloudinaryId = '';
    if (process.env.CLOUDINARY_API_KEY) {
      const uploadResult = await cloudinary.uploader.upload(imageBase64, {
        folder: 'loov-camera',
        tags: ['camera', filter, location ? 'geotagged' : ''],
        context: location ? `lat=${location.lat}|lng=${location.lng}` : '',
      });
      cloudinaryUrl = uploadResult.secure_url;
      cloudinaryId = uploadResult.public_id;
    }

    // 2. Save to Notion if DB ID provided
    let notionPageId = '';
    const NOTION_TOKEN = process.env.NOTION_API_KEY;
    if (NOTION_TOKEN && notionDbId) {
      const timestamp = new Date().toISOString();
      const notionBody: any = {
        parent: { database_id: notionDbId },
        properties: {
          이름: { title: [{ type: 'text', text: { content: `📸 ${metadata?.filename || timestamp.slice(0, 16)}` } }] },
          필터: { rich_text: [{ type: 'text', text: { content: filter || 'normal' } }] },
          촬영일시: { date: { start: timestamp } },
        },
      };

      if (location) {
        notionBody.properties['위도'] = { number: location.lat };
        notionBody.properties['경도'] = { number: location.lng };
        if (location.address) {
          notionBody.properties['위치'] = { rich_text: [{ type: 'text', text: { content: location.address } }] };
        }
      }

      if (cloudinaryUrl) {
        notionBody.properties['이미지'] = {
          files: [{ type: 'external', name: '사진', external: { url: cloudinaryUrl } }]
        };
      }

      const res = await fetch(`https://api.notion.com/v1/pages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notionBody),
      });
      const data = await res.json();
      notionPageId = data.id || '';
    }

    return NextResponse.json({ cloudinaryUrl, cloudinaryId, notionPageId, ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
