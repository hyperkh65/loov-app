import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createLoovClient } from '@/lib/loov-supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const loov = await createLoovClient()
  if (!loov) {
    return NextResponse.json({
      events: [], marketOverviews: [],
      stats: { total_products: 0, total_companies: 0, changes_24h: 0 },
      needSetup: true,
    })
  }

  try {
    const { data: eventData } = await loov
      .from('pro_change_events')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(20)

    const { data: overviewData } = await loov
      .from('pro_market_overviews')
      .select('*')
      .order('total_products', { ascending: false })

    let marketOverviews = overviewData || []

    if (marketOverviews.length === 0) {
      const { data: raw } = await loov.from('led_products').select('category, maker, price')
      if (raw && raw.length > 0) {
        const agg: Record<string, { comps: Set<string>; sku: number; prices: number[] }> = {}
        raw.forEach((p) => {
          const cat = p.category || '기타'
          if (!agg[cat]) agg[cat] = { comps: new Set(), sku: 0, prices: [] }
          agg[cat].comps.add(p.maker)
          agg[cat].sku++
          if (p.price > 0) agg[cat].prices.push(p.price)
        })
        marketOverviews = Object.entries(agg).map(([cat, a]) => {
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
      }
    }

    const { count: prodCount } = await loov
      .from('led_products')
      .select('*', { count: 'exact', head: true })

    const { data: makerData } = await loov.from('led_products').select('maker')
    const uniqueMakers = new Set<string>()
    ;(makerData || []).forEach((r: { maker: string }) => { if (r.maker) uniqueMakers.add(r.maker) })

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: recentChanges } = await loov
      .from('pro_change_events')
      .select('*', { count: 'exact', head: true })
      .gte('detected_at', yesterday)

    return NextResponse.json({
      events: eventData || [],
      marketOverviews,
      stats: {
        total_products: prodCount || 0,
        total_companies: uniqueMakers.size,
        changes_24h: recentChanges || 0,
      },
    })
  } catch {
    return NextResponse.json({
      events: [], marketOverviews: [],
      stats: { total_products: 0, total_companies: 0, changes_24h: 0 },
    })
  }
}
