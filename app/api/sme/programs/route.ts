import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Default built-in API config
const DEFAULT_SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY
const DEFAULT_ENDPOINT =
  'https://api.odcloud.kr/api/3034791/v1/uddi:fa09d13d-bce8-474e-b214-8008e79ec08f'

// Default field name mapping (공공데이터포털 표준)
const DEFAULT_FIELD_MAP = {
  id: '번호',
  title: '사업명',
  agency: '소관기관',
  executor: '수행기관',
  field: '지원분야',
  region: '지역',
  startDate: '신청시작일자',
  endDate: '신청종료일자',
  registeredAt: '등록일자',
  url: '사업공고URL',
}

// ALL 17 regions - complete mapping
const REGION_MAP: Record<string, string[]> = {
  서울: ['서울', '서울특별시'],
  경기: ['경기', '경기도'],
  인천: ['인천', '인천광역시'],
  부산: ['부산', '부산광역시'],
  대구: ['대구', '대구광역시'],
  광주: ['광주', '광주광역시'],
  대전: ['대전', '대전광역시'],
  울산: ['울산', '울산광역시'],
  세종: ['세종', '세종특별자치시', '세종시'],
  강원: ['강원', '강원도', '강원특별자치도'],
  충북: ['충북', '충청북도'],
  충남: ['충남', '충청남도'],
  전북: ['전북', '전북특별자치도', '전라북도'],
  전남: ['전남', '전라남도'],
  경북: ['경북', '경상북도'],
  경남: ['경남', '경상남도'],
  제주: ['제주', '제주특별자치도'],
  전국: ['전국'],
}

function normalizeRegion(raw?: string): string {
  if (!raw) return '전국'
  for (const [key, values] of Object.entries(REGION_MAP)) {
    if (values.some((v) => raw.includes(v))) return key
  }
  return '전국'
}

function getStatus(endDate?: string): '신청가능' | '마감' {
  if (!endDate) return '신청가능'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  return end.getTime() < today.getTime() ? '마감' : '신청가능'
}

type RawProgram = {
  id: string
  title: string
  agency: string
  executor: string
  field: string
  region: string
  regionRaw: string
  startDate?: string
  endDate?: string
  status: '신청가능' | '마감'
  registeredAt?: string
  url?: string
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? 1)
  const perPage = Number(searchParams.get('perPage') ?? 20)
  const region = searchParams.get('region') ?? ''
  const status = searchParams.get('status') ?? ''
  const keyword = searchParams.get('keyword')?.trim() ?? ''
  const field = searchParams.get('field') ?? ''
  const sort = searchParams.get('sort') ?? 'deadline'
  const id = searchParams.get('id') ?? ''

  // Dynamic API config (from settings panel — optional overrides)
  const apiEndpoint = searchParams.get('apiEndpoint') || DEFAULT_ENDPOINT
  const apiKey = searchParams.get('apiKey') || DEFAULT_SERVICE_KEY

  // Field mapping override (JSON string)
  let FM = { ...DEFAULT_FIELD_MAP }
  const fieldMapRaw = searchParams.get('fieldMap')
  if (fieldMapRaw) {
    try {
      FM = { ...FM, ...JSON.parse(fieldMapRaw) }
    } catch {
      // use default
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.' },
      { status: 500 }
    )
  }

  try {
    // Fetch first page to determine total count
    const firstRes = await fetch(
      `${apiEndpoint}?page=1&perPage=1000&returnType=JSON&serviceKey=${apiKey}`,
      { cache: 'no-store' }
    )
    const firstJson = await firstRes.json()

    // Debug: return raw field keys of first item
    if (searchParams.get('debug') === '1') {
      const sample = firstJson.data?.[0] ?? {}
      return NextResponse.json({ keys: Object.keys(sample), sample })
    }

    const apiTotalCount: number = firstJson.totalCount ?? firstJson.data?.length ?? 0
    const totalApiPages = Math.min(Math.ceil(apiTotalCount / 1000), 5) // cap at 5000

    // Fetch remaining pages in parallel (if any)
    let allData: unknown[] = firstJson.data ?? []
    if (totalApiPages > 1) {
      const extraFetches = Array.from({ length: totalApiPages - 1 }, (_, i) =>
        fetch(
          `${apiEndpoint}?page=${i + 2}&perPage=1000&returnType=JSON&serviceKey=${apiKey}`,
          { cache: 'no-store' }
        ).then((r) => r.json()).then((j) => j.data ?? [])
      )
      const extraData = await Promise.all(extraFetches)
      allData = [...allData, ...extraData.flat()]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let programs: RawProgram[] = (allData as any[]).map((item: any) => {
      const endDate = item[FM.endDate]
      // Try multiple common URL field names as fallback
      const urlValue =
        item[FM.url] ||
        item['사업공고URL'] ||
        item['공고URL'] ||
        item['사업URL'] ||
        item['신청URL'] ||
        item['링크URL'] ||
        item['url'] ||
        item['URL'] ||
        ''

      return {
        id: String(item[FM.id] ?? Math.random()),
        title: item[FM.title] ?? '',
        agency: item[FM.agency] ?? '',
        executor: item[FM.executor] ?? '',
        field: item[FM.field] ?? '기타',
        region: normalizeRegion(item[FM.region]),
        regionRaw: item[FM.region] ?? '',
        startDate: item[FM.startDate],
        endDate,
        status: getStatus(endDate),
        registeredAt: item[FM.registeredAt] ?? '',
        url: urlValue,
      }
    })

    // Single item lookup
    if (id) {
      const program = programs.find((p) => p.id === id)
      return NextResponse.json({ program: program ?? null })
    }

    // Keyword filter
    if (keyword) {
      programs = programs.filter(
        (p) => p.title.includes(keyword) || p.agency?.includes(keyword)
      )
    }

    // Region filter - 전국 공고는 항상 포함
    if (region && region !== '전국') {
      programs = programs.filter(
        (p) => p.region === region || p.region === '전국'
      )
    }

    // Field filter
    if (field) {
      programs = programs.filter((p) => p.field?.includes(field))
    }

    // Status filter
    if (status) {
      programs = programs.filter((p) => p.status === status)
    }

    // Sort
    if (sort === 'deadline') {
      programs.sort((a, b) => {
        if (a.status === '마감' && b.status !== '마감') return 1
        if (a.status !== '마감' && b.status === '마감') return -1
        return (
          new Date(a.endDate ?? '').getTime() -
          new Date(b.endDate ?? '').getTime()
        )
      })
    } else if (sort === 'latest') {
      programs.sort(
        (a, b) =>
          new Date(b.registeredAt ?? '').getTime() -
          new Date(a.registeredAt ?? '').getTime()
      )
    }

    // Stats
    const totalCount = programs.length
    const activeCount = programs.filter((p) => p.status === '신청가능').length
    const closedCount = totalCount - activeCount

    // Get unique fields for filter options
    const allFields = [
      ...new Set(programs.map((p) => p.field).filter(Boolean)),
    ] as string[]

    // Paginate
    const totalPages = Math.ceil(totalCount / perPage)
    const start = (page - 1) * perPage
    const paginated = programs.slice(start, start + perPage)

    return NextResponse.json({
      page,
      perPage,
      totalPages,
      totalCount,
      activeCount,
      closedCount,
      programs: paginated,
      fields: allFields.slice(0, 20),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'API 호출 실패' }, { status: 500 })
  }
}
