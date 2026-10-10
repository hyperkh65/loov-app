import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { readFromR2, uploadToR2 } from '@/lib/r2-storage'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companySearch = searchParams.get('company') || ''

  try {
    const [companiesJson, productsJson, changesJson] = await Promise.all([
      readFromR2('g2b-data/companies.json'),
      readFromR2('g2b-data/products.json'),
      readFromR2('g2b-data/changes.json'),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let companies: any[] = companiesJson ? JSON.parse(companiesJson) : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let products: any[] = productsJson ? JSON.parse(productsJson) : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = changesJson ? JSON.parse(changesJson) : []

    if (companySearch) {
      companies = companies.filter(c => c.name?.includes(companySearch))
      products = products.filter(p => p.company?.includes(companySearch))
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const changes24h = changes.filter(c => c.detected_at > yesterday).length

    return NextResponse.json({
      companies: companies.slice(0, 200),
      products: products.slice(0, 500),
      changes: changes.slice(0, 100),
      stats: {
        total_companies: companies.length,
        total_products: products.length,
        changes_24h: changes24h,
      },
    })
  } catch {
    return NextResponse.json({
      companies: [], products: [], changes: [],
      stats: { total_companies: 0, total_products: 0, changes_24h: 0 },
    })
  }
}

// 특정 업체 추적 등록/해제
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { action, company_name } = await req.json()

  const watchlistJson = await readFromR2('g2b-data/watchlist.json')
  const watchlist: string[] = watchlistJson ? JSON.parse(watchlistJson) : []

  if (action === 'add' && !watchlist.includes(company_name)) {
    watchlist.push(company_name)
  } else if (action === 'remove') {
    const idx = watchlist.indexOf(company_name)
    if (idx >= 0) watchlist.splice(idx, 1)
  }

  await uploadToR2('g2b-data/watchlist.json', Buffer.from(JSON.stringify(watchlist)), 'application/json')
  return NextResponse.json({ ok: true, watchlist })
}
