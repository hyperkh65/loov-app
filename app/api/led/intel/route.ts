import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const limit = Number(searchParams.get('limit') || 1000)
  const category = searchParams.get('category') || ''

  try {
    const { data: reports } = await supabase
      .from('led_reports')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(1)

    const report = reports?.[0] || null

    let allProducts: unknown[] = []
    let offset = 0
    const PAGE_SIZE = 1000

    while (allProducts.length < Math.min(limit, 10000)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from('led_products')
        .select('*')
        .order('collected_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (search) q = q.or(`name.ilike.%${search}%,maker.ilike.%${search}%`)
      if (category) q = q.eq('category', category)

      const { data, error } = await q
      if (error || !data || data.length === 0) break
      allProducts = [...allProducts, ...data]
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    return NextResponse.json({ products: allProducts, report })
  } catch {
    return NextResponse.json({ products: [], report: null })
  }
}
