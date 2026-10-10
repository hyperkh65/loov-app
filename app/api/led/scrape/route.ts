import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { uploadToR2, readFromR2 } from '@/lib/r2-storage'
import { getSetting } from '@/lib/get-setting'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DANAWA_CATEGORIES = [
  { name: 'LED 전구', url: 'https://search.danawa.com/dsearch.php?query=LED+전구&tab=goods' },
  { name: 'LED 등기구', url: 'https://search.danawa.com/dsearch.php?query=LED+등기구&tab=goods' },
  { name: 'LED 조명', url: 'https://search.danawa.com/dsearch.php?query=LED+조명&tab=goods' },
  { name: 'LED 투광기', url: 'https://search.danawa.com/dsearch.php?query=LED+투광기&tab=goods' },
  { name: 'LED 가로등', url: 'https://search.danawa.com/dsearch.php?query=LED+가로등&tab=goods' },
]

interface Product {
  id: string
  name: string
  price: number
  maker: string
  category: string
  image_url: string
  product_url: string
  collected_at: string
}

async function scrapeDanawa(category: string, searchUrl: string): Promise<Product[]> {
  const products: Product[] = []

  for (let page = 1; page <= 3; page++) {
    try {
      const url = `${searchUrl}&page=${page}&limit=30`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      })
      if (!res.ok) break

      const html = await res.text()

      // 상품 카드 파싱 (다나와 검색결과 구조)
      const productMatches = html.matchAll(
        /class="[^"]*prod-item[^"]*"[\s\S]*?class="[^"]*prod-name[^"]*"[\s\S]*?href="([^"]+)"[^>]*>([^<]+)<[\s\S]*?class="[^"]*price-sect[^"]*"[\s\S]*?(\d[\d,]+)원[\s\S]*?class="[^"]*maker-name[^"]*"[^>]*>([^<]+)</g
      )

      let found = 0
      for (const m of productMatches) {
        const productUrl = m[1].startsWith('http') ? m[1] : `https://prod.danawa.com${m[1]}`
        const name = m[2].trim()
        const price = parseInt(m[3].replace(/,/g, ''))
        const maker = m[4].trim()

        // 이미지 URL 추출 시도
        const imgMatch = html.match(new RegExp(`href="${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,500}?src="([^"]+\\.(?:jpg|png|webp)[^"]*)"`, 'i'))
        const imageUrl = imgMatch?.[1] || ''

        products.push({
          id: `danawa_${Date.now()}_${found}`,
          name,
          price,
          maker,
          category,
          image_url: imageUrl,
          product_url: productUrl,
          collected_at: new Date().toISOString(),
        })
        found++
      }

      if (found === 0) break
      await new Promise(r => setTimeout(r, 500))
    } catch {
      break
    }
  }

  return products
}

async function scrapeWithAI(aiKey: string): Promise<Product[]> {
  const products: Product[] = []

  for (const cat of DANAWA_CATEGORIES) {
    const res = await fetch(`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(cat.name)}&tab=goods`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LEDBot/1.0)' },
    })
    if (!res.ok) continue
    const html = await res.text()

    // AI로 상품 정보 추출
    const aiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + aiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `다음 다나와 검색결과 HTML에서 LED 상품 목록을 JSON 배열로 추출하세요. 최대 20개.
각 항목: { "name": "상품명", "price": 숫자(원), "maker": "제조사", "image_url": "이미지URL", "product_url": "상품URL" }
HTML (앞 8000자):\n${html.slice(0, 8000)}
JSON만 반환:`
          }]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      }),
    })

    if (!aiRes.ok) continue
    const aiData = await aiRes.json()
    const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) continue

    try {
      const items = JSON.parse(jsonMatch[0])
      items.forEach((item: Partial<Product>, i: number) => {
        products.push({
          id: `danawa_${cat.name}_${Date.now()}_${i}`,
          name: item.name || '',
          price: Number(item.price) || 0,
          maker: item.maker || '',
          category: cat.name,
          image_url: item.image_url || '',
          product_url: item.product_url || '',
          collected_at: new Date().toISOString(),
        })
      })
    } catch { /* skip */ }

    await new Promise(r => setTimeout(r, 1000))
  }

  return products
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  // GitHub Actions webhook 시크릿 검증
  const authHeader = req.headers.get('authorization')
  const scrapeSecret = process.env.LED_SCRAPE_SECRET || await getSetting('LED_SCRAPE_SECRET')
  if (scrapeSecret && authHeader !== `Bearer ${scrapeSecret}`) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  try {
    const geminiKey = process.env.GEMINI_API_KEY || await getSetting('GEMINI_API_KEY')
    let allProducts: Product[] = []

    if (geminiKey) {
      allProducts = await scrapeWithAI(geminiKey)
    } else {
      // AI 없이 직접 파싱
      for (const cat of DANAWA_CATEGORIES) {
        const items = await scrapeDanawa(cat.name, cat.url)
        allProducts = [...allProducts, ...items]
      }
    }

    // 기존 데이터 병합 (최신 수집 우선)
    const existingJson = await readFromR2('led-data/products.json')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = existingJson ? JSON.parse(existingJson) : []
    const existingNames = new Set(allProducts.map(p => p.name))
    const merged = [...allProducts, ...existing.filter(p => !existingNames.has(p.name))].slice(0, 5000)

    const report = {
      generated_at: new Date().toISOString(),
      total_count: merged.length,
      newly_collected: allProducts.length,
      ai_commentary: allProducts.length > 0
        ? `총 ${merged.length}개 LED 제품 데이터 수집 완료. ${DANAWA_CATEGORIES.map(c => c.name).join(', ')} 카테고리 분석 중.`
        : '데이터 수집에 실패했습니다. 다시 시도해주세요.',
    }

    await Promise.all([
      uploadToR2('led-data/products.json', Buffer.from(JSON.stringify(merged)), 'application/json'),
      uploadToR2('led-data/report.json', Buffer.from(JSON.stringify(report)), 'application/json'),
    ])

    return NextResponse.json({ ok: true, collected: allProducts.length, total: merged.length })
  } catch (e) {
    console.error('LED scrape error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
