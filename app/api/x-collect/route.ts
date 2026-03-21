import { NextRequest, NextResponse } from 'next/server'

const SCRAPER_API = 'http://aboda.kr:5053'
const API_KEY = 'xc-aboda-2026'

// POST /api/x-collect — 수집 시작
export async function POST(req: NextRequest) {
  const { username, count } = await req.json()
  if (!username) return NextResponse.json({ error: '계정명 필요' }, { status: 400 })

  const res = await fetch(`${SCRAPER_API}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ username, count: count ?? 0 }),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

// GET /api/x-collect — 작업 목록
export async function GET() {
  const res = await fetch(`${SCRAPER_API}/jobs`, {
    headers: { 'x-api-key': API_KEY },
    cache: 'no-store',
  })
  const data = await res.json()
  return NextResponse.json(data)
}
