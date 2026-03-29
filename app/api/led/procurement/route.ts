import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { readFromR2 } from '@/lib/r2-storage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  try {
    const productsJson = await readFromR2('led-data/products.json')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = productsJson ? JSON.parse(productsJson) : []

    if (raw.length === 0) {
      return NextResponse.json({
        events: [], marketOverviews: [],
        stats: { total_products: 0, total_companies: 0, changes_24h: 0 },
      })
    }

    // 카테고리별 집계
    const agg: Record<string, { comps: Set<string>; sku: number; prices: number[] }> = {}
    raw.forEach((p) => {
      const cat = p.category || '기타'
      if (!agg[cat]) agg[cat] = { comps: new Set(), sku: 0, prices: [] }
      agg[cat].comps.add(p.maker)
      agg[cat].sku++
      if (p.price > 0) agg[cat].prices.push(p.price)
    })

    const marketOverviews = Object.entries(agg).map(([cat, a]) => {
      const sorted = [...a.prices].sort((x, y) => x - y)
      return {
        category_name: cat,
        total_companies: a.comps.size,
        total_products: a.sku,
        min_price: sorted[0] || 0,
        median_price: sorted[Math.floor(sorted.length / 2)] || 0,
        avg_efficacy: null,
      }
    }).sort((a, b) => b.total_products - a.total_products)

    const uniqueMakers = new Set(raw.map(p => p.maker).filter(Boolean))

    return NextResponse.json({
      events: [],
      marketOverviews,
      stats: {
        total_products: raw.length,
        total_companies: uniqueMakers.size,
        changes_24h: 0,
      },
    })
  } catch {
    return NextResponse.json({
      events: [], marketOverviews: [],
      stats: { total_products: 0, total_companies: 0, changes_24h: 0 },
    })
  }
}
