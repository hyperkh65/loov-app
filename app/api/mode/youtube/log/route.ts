import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const logFile = searchParams.get('file');
  const pid = searchParams.get('pid');

  try {
    // 진행중 여부
    let running = false;
    if (pid) {
      const ps = await nasExec(`ps -p ${pid} > /dev/null 2>&1 && echo running || echo stopped`);
      running = ps.stdout.trim() === 'running';
    }

    // 최근 로그
    let lines = '';
    if (logFile) {
      const result = await nasExec(`tail -30 "${logFile}" 2>/dev/null || echo "로그 없음"`);
      lines = result.stdout;
    } else {
      // 최신 로그 파일 자동 선택
      const result = await nasExec(`ls -t /tmp/ytdl_*.log 2>/dev/null | head -1 | xargs tail -30 2>/dev/null || echo "로그 없음"`);
      lines = result.stdout;
    }

    // 다운로드 현황
    const stats = await nasExec(`
      find /volume1/homes/urjent/youtube_downloads -name "*.mp4" 2>/dev/null | wc -l
    `);

    return NextResponse.json({
      running,
      lines: lines.split('\n').filter(Boolean),
      totalVideos: parseInt(stats.stdout.trim()) || 0,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
