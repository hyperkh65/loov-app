/**
 * WeChat 대화방 메시지 조회 API
 * GET /api/wechat/messages?room=<filename>
 * NAS의 .txt 파일을 읽어 메시지 파싱
 */
import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

export interface WeChatMessage {
  time: string;
  sender: string;
  content: string;
  isMedia: boolean;
  mediaType?: string;
  fileName?: string;    // [파일:name:YYYY-MM] 에서 추출
  filePath?: string;    // NAS serve 경로
}

const NAS_CHATS_DIR = '/volume1/homes/urjent/wechat_backup/chats';
const MEDIA_PATTERNS = ['[이미지]', '[영상]', '[음성]', '[스티커]', '[파일]', '[위치]', '[미디어]', '[GIF]'];
const MY_IDS = ['3']; // 내 local_id

// 이진 데이터 비율이 높으면 WeChat XML/압축 메시지로 판단
function sanitizeContent(content: string): { text: string; isMedia: boolean; mediaType?: string } {
  // 이미 미디어 라벨인 경우
  for (const p of MEDIA_PATTERNS) {
    if (content.includes(p)) return { text: content, isMedia: true, mediaType: p.replace(/[\[\]]/g, '') };
  }

  // Python repr() 스타일 \xNN 이스케이프 시퀀스 감지 (바이너리 dump)
  const hexEscapes = (content.match(/\\x[0-9a-fA-F]{2}/g) ?? []).length;
  if (hexEscapes > 3) {
    // XML title 추출 시도
    const titleMatch = content.match(/<title[^>]*>\s*<!\[CDATA\[([^\]]+)\]\]>\s*<\/title>|<title[^>]*>([^<]+)<\/title>/);
    const title = titleMatch?.[1] ?? titleMatch?.[2];
    if (title?.trim()) {
      return { text: `[공유] ${title.trim()}`, isMedia: true, mediaType: '공유' };
    }
    return { text: '[링크/공유 메시지]', isMedia: true, mediaType: '링크' };
  }

  // 유니코드 대체문자(U+FFFD, ◆) 비율 계산
  const replacements = (content.match(/[\uFFFD\u25C6\x00-\x08\x0E-\x1F]/g) ?? []).length;
  const binaryRatio = replacements / Math.max(content.length, 1);

  if (binaryRatio > 0.05) {
    return { text: '[링크/공유 메시지]', isMedia: true, mediaType: '링크' };
  }

  return { text: content, isMedia: false };
}

function parseMessages(text: string): WeChatMessage[] {
  const lines = text.split('\n');
  const messages: WeChatMessage[] = [];
  const msgLineRe = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (\d+|나): ([\s\S]+)$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(msgLineRe);
    if (m) {
      const time = m[1];
      const senderId = m[2];
      let content = m[3];

      // 멀티라인 메시지 처리 (다음 타임스탬프까지)
      i++;
      while (i < lines.length && !lines[i].match(/^\[\d{4}-\d{2}-\d{2}/)) {
        if (lines[i].trim()) content += '\n' + lines[i];
        i++;
      }

      const sanitized = sanitizeContent(content.trim());

      // [파일:filename:YYYY-MM] 형식 파싱
      let fileName: string | undefined;
      let filePath: string | undefined;
      const fileMatch = sanitized.text.match(/^\[파일:([^:]+):(\d{4}-\d{2})\]$/);
      if (fileMatch) {
        fileName = fileMatch[1];
        filePath = `file/${fileMatch[2]}/${fileMatch[1]}`;
      }

      messages.push({
        time,
        sender: MY_IDS.includes(senderId) ? '나' : senderId,
        content: fileMatch ? `📎 ${fileName}` : sanitized.text,
        isMedia: sanitized.isMedia,
        mediaType: fileMatch ? '파일' : sanitized.mediaType,
        fileName,
        filePath,
      });
    } else {
      i++;
    }
  }

  return messages;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get('room');

  if (!room) {
    return NextResponse.json({ error: 'room 파라미터 필요' }, { status: 400 });
  }

  // Path traversal 방지
  const safeRoom = room.replace(/[/\\]/g, '').replace(/\.\./g, '');
  const filePath = `${NAS_CHATS_DIR}/${safeRoom}.txt`;

  try {
    // 파일 전체 읽기
    const result = await nasExec(`cat "${filePath}" 2>/dev/null`);

    if (!result.stdout || result.code !== 0) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다', messages: [] }, { status: 404 });
    }

    const content = result.stdout;

    // 헤더 파싱
    const nameMatch = content.match(/^대화방: (.+)$/m);
    const idMatch = content.match(/^ID: (.+)$/m);
    const countMatch = content.match(/^메시지: (\d+)/m);

    const messages = parseMessages(content);

    const hashMatch = content.match(/^HASH: (.+)$/m);

    return NextResponse.json({
      name: nameMatch?.[1]?.trim() ?? safeRoom,
      id: idMatch?.[1]?.trim() ?? '',
      roomHash: hashMatch?.[1]?.trim() ?? '',
      totalCount: parseInt(countMatch?.[1] ?? '0'),
      messages,
    });
  } catch (e) {
    console.error('wechat/messages:', e);
    return NextResponse.json({ error: String(e), messages: [] }, { status: 500 });
  }
}
