import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { readFromR2 } from '@/lib/r2-storage'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const origin = searchParams.get('origin') || ''

  try {
    const [productsJson, reportJson] = await Promise.all([
      readFromR2('led-data/products.json'),
      readFromR2('led-data/report.json'),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let products: any[] = productsJson ? JSON.parse(productsJson) : []
    const report = reportJson ? JSON.parse(reportJson) : null

    if (search) {
      const q = search.toLowerCase()
      products = products.filter(p =>
        p.name?.toLowerCase().includes(q) || p.maker?.toLowerCase().includes(q)
      )
    }
    if (category) products = products.filter(p => p.category === category)
    if (origin)   products = products.filter(p => p.origin === origin)

    return NextResponse.json({ products, report })
  } catch {
    return NextResponse.json({ products: [], report: null })
  }
}
