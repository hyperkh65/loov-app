import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Set this in .env.local: DATA_GO_KR_SERVICE_KEY=발급받은키
// Get your key at https://www.data.go.kr
const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY
const BASE_URL =
  'https://api.odcloud.kr/api/3034791/v1/uddi:fa09d13d-bce8-474e-b214-8008e79ec08f'

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

  if (!SERVICE_KEY) {
    return NextResponse.json(
      { error: 'DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(
      `${BASE_URL}?page=1&perPage=1000&returnType=JSON&serviceKey=${SERVICE_KEY}`,
      { cache: 'no-store' }
    )
    const json = await res.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let programs: RawProgram[] = (json.data ?? []).map((item: any) => {
      const title = item['사업명'] ?? ''
      const endDate = item['신청종료일자']
      const startDate = item['신청시작일자']
      const fieldValue = item['지원분야'] ?? '기타'

      return {
        id: String(item['번호']),
        title,
        agency: item['소관기관'] ?? '',
        executor: item['수행기관'] ?? '',
        field: fieldValue,
        region: normalizeRegion(item['지역']),
        regionRaw: item['지역'] ?? '',
        startDate,
        endDate,
        status: getStatus(endDate),
        registeredAt: item['등록일자'] ?? '',
        url: item['사업공고URL'] ?? '',
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
