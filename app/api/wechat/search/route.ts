/**
 * WeChat 메시지 전체 검색
 * GET /api/wechat/search?q=키워드&limit=50
 */
import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const NAS_CHATS = '/volume1/homes/urjent/wechat_backup/chats';

export interface SearchResult {
  room: string;      // 대화방명
  filename: string;  // URL용 파일명
  time: string;
  sender: string;
  content: string;
  context: string;   // 전후 문맥
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

  // grep -i 로 대소문자 무시, -n 줄번호
  const escaped = q.replace(/['"\\`$]/g, '\\$&');
  const cmd = `grep -rin "${escaped}" "${NAS_CHATS}"/*.txt 2>/dev/null | head -${limit}`;

  try {
    const r = await nasExec(cmd);
    if (!r.stdout) return NextResponse.json({ results: [] });

    const lines = r.stdout.split('\n').filter(Boolean);
    const results: SearchResult[] = [];

    for (const line of lines) {
      // format: /path/to/file.txt:linenum:[timestamp] sender: content
      const match = line.match(/^(.+\.txt):(\d+):(\[[\d\- :]+\]) ([^:]+): (.+)$/);
      if (!match) continue;

      const [, filePath, , time, sender, content] = match;
      const filename = filePath.split('/').pop()?.replace(/\.txt$/, '') ?? '';
      const room = filename;

      results.push({
        room,
        filename,
        time: time.slice(1, -1),
        sender: sender.trim(),
        content: content.slice(0, 200),
        context: content.slice(0, 200),
      });
    }

    return NextResponse.json({ results, total: results.length });
  } catch (e) {
    return NextResponse.json({ error: String(e), results: [] }, { status: 500 });
  }
}
