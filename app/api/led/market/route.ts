import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') || ''

  let query = supabase
    .from('led_market_data')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (category && category !== 'All') {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ data: [], stats: { total: 0, analysis: 0, procurement: 0 } })
  }

  const allData = data || []
  const total = allData.reduce((acc, curr) => acc + (curr.value || 0), 0)
  const analysis = allData.filter((d) => d.category === '분석').length
  const procurement = allData.filter((d) => d.category === '조달시장').length

  return NextResponse.json({ data: allData, stats: { total, analysis, procurement } })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { title, category, value, description } = await req.json()
  if (!title || value === undefined) {
    return NextResponse.json({ error: '제목과 값을 입력하세요' }, { status: 400 })
  }

  const { data, error } = await supabase.from('led_market_data').insert([{
    title,
    category: category || '분析',
    value: Number(value),
    description: description || '',
    user_id: user.id,
    date: new Date().toISOString(),
  }]).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('led_market_data')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
