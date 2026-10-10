/**
 * WeChat 대화방 목록 API
 * GET /api/wechat/rooms
 * NAS /homes/urjent/wechat_backup/chats/ 의 .txt 파일 목록 반환
 */
import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

export interface ChatRoom {
  filename: string;   // URL-safe filename (without .txt)
  name: string;       // 대화방 이름
  id: string;         // WeChat username/chatroom ID
  count: number;      // 메시지 수
  isGroup: boolean;   // @chatroom 여부
}

const NAS_CHATS_DIR = '/volume1/homes/urjent/wechat_backup/chats';

export async function GET() {
  try {
    // 파일 목록 가져오기
    const lsResult = await nasExec(`ls "${NAS_CHATS_DIR}"/ 2>/dev/null`);
    if (lsResult.code !== 0 && !lsResult.stdout) {
      return NextResponse.json({ error: 'NAS 연결 실패 또는 데이터 없음', rooms: [] }, { status: 200 });
    }

    const filenames = lsResult.stdout.split('\n').filter(f => f.endsWith('.txt'));

    if (filenames.length === 0) {
      return NextResponse.json({ rooms: [], synced: false });
    }

    // 모든 파일의 처음 3줄을 한번에 읽기 (awk로 파일명 구분)
    const headResult = await nasExec(
      `for f in "${NAS_CHATS_DIR}"/*.txt; do echo "===FILE:$(basename "$f")==="; head -4 "$f"; done`
    );
    const lines = headResult.stdout.split('\n');

    const rooms: ChatRoom[] = [];
    let currentFile = '';
    let name = '';
    let id = '';
    let count = 0;

    for (const line of lines) {
      if (line.startsWith('===FILE:') && line.endsWith('===')) {
        if (currentFile && name) {
          rooms.push({
            filename: currentFile.replace(/\.txt$/, ''),
            name,
            id,
            count,
            isGroup: id.includes('@chatroom'),
          });
        }
        currentFile = line.slice(8, -3);
        name = '';
        id = '';
        count = 0;
      } else if (line.startsWith('대화방: ')) {
        name = line.slice(4).trim();
      } else if (line.startsWith('ID: ')) {
        id = line.slice(4).trim();
      } else if (line.startsWith('메시지: ')) {
        count = parseInt(line.replace('메시지: ', '').replace('개', '').trim()) || 0;
      }
    }

    // 마지막 파일
    if (currentFile && name) {
      rooms.push({
        filename: currentFile.replace(/\.txt$/, ''),
        name,
        id,
        count,
        isGroup: id.includes('@chatroom'),
      });
    }

    // 메시지 수 기준 내림차순 정렬
    rooms.sort((a, b) => b.count - a.count);

    return NextResponse.json({ rooms, total: rooms.length, synced: true });
  } catch (e) {
    console.error('wechat/rooms:', e);
    return NextResponse.json({ error: String(e), rooms: [] }, { status: 500 });
  }
}
