import { NextRequest, NextResponse } from 'next/server'

const SCRAPER_API = 'http://aboda.kr:5053'
const API_KEY = 'xc-aboda-2026'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const res = await fetch(`${SCRAPER_API}/status/${jobId}`, {
    headers: { 'x-api-key': API_KEY },
    cache: 'no-store',
  })
  const data = await res.json()
  return NextResponse.json(data)
}
