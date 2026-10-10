import { NextRequest, NextResponse } from 'next/server'
import { nasExec } from '@/lib/nas-ssh'
import { readFromR2, uploadToR2 } from '@/lib/r2-storage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NAS_DIR = '/volume1/web/xmedia'
const NAS_URL_BASE = 'https://hy64.synology.me/xmedia'
const CACHE_KEY = 'xmedia-index.json'

type NasVideo = { username: string; filename: string; url: string; size: number; modified: string }
type CacheData = { accounts: string[]; videos: NasVideo[]; total: number; cached_at: string }

// SSH 단 1회로 전체 파일 스캔 후 R2에 저장
export async function scanAndCache(): Promise<CacheData> {
  // find 로 한 번에 모든 영상 파일 출력: "계정/파일명|크기|날짜"
  const res = await nasExec(
    `find "${NAS_DIR}" -maxdepth 2 -type f \\( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" -o -name "*.mkv" \\) ` +
    `-printf "%P|%s|%TY-%Tm-%Td\\n" 2>/dev/null || echo ""`
  )

  const videos: NasVideo[] = []
  const accountSet = new Set<string>()

  for (const line of (res.stdout || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [rel, sizeStr, modified] = trimmed.split('|')
    if (!rel || !sizeStr) continue
    const slashIdx = rel.indexOf('/')
    if (slashIdx < 0) continue
    const username = rel.slice(0, slashIdx)
    const filename = rel.slice(slashIdx + 1)
    if (!filename) continue
    accountSet.add(username)
    videos.push({
      username, filename,
      url: `${NAS_URL_BASE}/${username}/${encodeURIComponent(filename)}`,
      size: parseInt(sizeStr) || 0,
      modified: modified || '',
    })
  }

  videos.sort((a, b) => b.filename.localeCompare(a.filename))
  const accounts = [...accountSet].sort()

  const data: CacheData = { accounts, videos, total: videos.length, cached_at: new Date().toISOString() }
  await uploadToR2(CACHE_KEY, Buffer.from(JSON.stringify(data)), 'application/json')
  return data
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username') || ''
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'

  try {
    let data: CacheData | null = null

    if (!refresh) {
      // R2 캐시 우선
      const cached = await readFromR2(CACHE_KEY)
      if (cached) data = JSON.parse(cached)
    }

    if (!data) {
      // 캐시 없거나 refresh 요청 → SSH 스캔
      data = await scanAndCache()
    }

    // username 필터
    const accounts = data.accounts
    const videos = username ? data.videos.filter(v => v.username === username) : data.videos

    return NextResponse.json({ accounts, videos, total: videos.length, cached_at: data.cached_at })
  } catch (e) {
    console.error('NAS video list error:', e)
    return NextResponse.json({ accounts: [], videos: [], total: 0, error: String(e) })
  }
}
