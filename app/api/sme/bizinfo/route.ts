import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY

// 기업마당(bizinfo) 지원사업 공고 API
// data.go.kr ID: 15157820
const BIZINFO_URL = 'https://apis.data.go.kr/1421000/bizinfo/pblancBsnsService'

// K-Startup 창업공고 API
// data.go.kr ID: 15125364
const KSTARTUP_URL =
  'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01'

// 중소벤처기업부 사업공고 API
// data.go.kr ID: 15113297
const MSS_URL = 'https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2'

function getStatus(endDate?: string): '신청가능' | '마감' {
  if (!endDate) return '신청가능'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  return end.getTime() < today.getTime() ? '마감' : '신청가능'
}

// ── 기업마당 bizinfo API 파싱 ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBizinfo(items: any[]) {
  return items.map((item, idx) => {
    const endDateRaw: string = item.reqstBeginEndDe?.split('~')?.[1]?.trim() ?? ''
    const startDateRaw: string = item.reqstBeginEndDe?.split('~')?.[0]?.trim() ?? ''
    // Extract date parts (handle 신청기간 format: "2025.01.01 ~ 2025.06.30")
    const parseDate = (s: string) => s?.replace(/\./g, '-') ?? ''
    const endDate = parseDate(endDateRaw)
    const startDate = parseDate(startDateRaw)

    return {
      id: item.pblancId ?? String(idx),
      title: item.pblancNm ?? '',
      agency: item.jrsdInsttNm ?? '',
      executor: item.excInsttNm ?? '',
      field: item.pldirSportRealmLclasCodeNm ?? '기타',
      region: extractRegionFromHashtags(item.hashtags ?? ''),
      startDate,
      endDate,
      status: getStatus(endDate),
      registeredAt: (item.creatPnttm ?? '').slice(0, 10),
      url: item.pblancUrl ?? item.rceptEngnHmpgUrl ?? '',
    }
  })
}

function extractRegionFromHashtags(hashtags: string): string {
  const REGION_KEYWORDS = [
    '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산',
    '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  ]
  for (const r of REGION_KEYWORDS) {
    if (hashtags.includes(r)) return r
  }
  return '전국'
}

// ── K-Startup API 파싱 ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseKstartup(items: any[]) {
  return items.map((item, idx) => {
    const endDate = (item.pbanc_rcpt_end_dt ?? '').slice(0, 10)
    const startDate = (item.pbanc_rcpt_bgng_dt ?? '').slice(0, 10)
    return {
      id: item.intg_pbanc_yn + String(idx),
      title: item.biz_pbanc_nm ?? item.intg_pbanc_biz_nm ?? '',
      agency: '',
      executor: '',
      field: item.supt_biz_clsfc ?? '창업',
      region: item.supt_regin ?? '전국',
      startDate,
      endDate,
      status: getStatus(endDate),
      registeredAt: '',
      url: item.detl_pg_url ?? '',
    }
  })
}

// ── 중소벤처기업부 API 파싱 ───────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMss(items: any[]) {
  return items.map((item) => {
    const endDate = (item.applicationEndDate ?? '').slice(0, 10)
    const startDate = (item.applicationStartDate ?? '').slice(0, 10)
    return {
      id: item.itemId ?? String(Math.random()),
      title: item.title ?? '',
      agency: '중소벤처기업부',
      executor: '',
      field: '기타',
      region: '전국',
      startDate,
      endDate,
      status: getStatus(endDate),
      registeredAt: '',
      url: item.viewUrl ?? '',
    }
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const apiType = searchParams.get('apiType') ?? 'bizinfo' // bizinfo | kstartup | mss
  const page = Number(searchParams.get('page') ?? 1)
  const perPage = Number(searchParams.get('perPage') ?? 20)
  const keyword = searchParams.get('keyword')?.trim() ?? ''
  const region = searchParams.get('region') ?? ''
  const status = searchParams.get('status') ?? ''
  const field = searchParams.get('field') ?? ''
  const sort = searchParams.get('sort') ?? 'deadline'
  const apiKey = searchParams.get('apiKey') || SERVICE_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.' }, { status: 500 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let programs: any[] = []

    if (apiType === 'bizinfo') {
      // 기업마당: 여러 페이지 순회 (numOfRows 최대 100)
      const numOfRows = 100
      const firstUrl = `${BIZINFO_URL}?serviceKey=${apiKey}&dataType=json&pageNo=1&numOfRows=${numOfRows}`
      const firstRes = await fetch(firstUrl, { cache: 'no-store' })
      const firstJson = await firstRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getItems = (j: any) => {
        const items = j?.response?.body?.items?.item ?? j?.response?.body?.items ?? []
        return Array.isArray(items) ? items : [items]
      }
      const totalCount: number = Number(firstJson?.response?.body?.totalCount ?? 0)
      const totalPages = Math.min(Math.ceil(totalCount / numOfRows), 30)
      let allItems = getItems(firstJson)

      if (totalPages > 1) {
        const extras = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            fetch(`${BIZINFO_URL}?serviceKey=${apiKey}&dataType=json&pageNo=${i + 2}&numOfRows=${numOfRows}`, { cache: 'no-store' })
              .then((r) => r.json())
              .then(getItems)
          )
        )
        allItems = [...allItems, ...extras.flat()]
      }
      programs = parseBizinfo(allItems)

    } else if (apiType === 'kstartup') {
      const url = `${KSTARTUP_URL}?serviceKey=${apiKey}&returnType=json&page=1&perPage=1000`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      const items = json?.data ?? []
      programs = parseKstartup(Array.isArray(items) ? items : [])

    } else if (apiType === 'mss') {
      const url = `${MSS_URL}?serviceKey=${apiKey}&pageNo=1&numOfRows=1000&dataType=json`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = json?.response?.body?.items?.item ?? []
      programs = parseMss(Array.isArray(items) ? items : [items])
    }

    // ── Filters ──────────────────────────────────────────────────────
    if (keyword) {
      programs = programs.filter(
        (p) => p.title.includes(keyword) || p.agency?.includes(keyword) || p.field?.includes(keyword)
      )
    }
    if (region && region !== '전국') {
      programs = programs.filter((p) => p.region === region || p.region === '전국')
    }
    if (field) {
      programs = programs.filter((p) => p.field?.includes(field))
    }
    if (status) {
      programs = programs.filter((p) => p.status === status)
    }

    // ── Sort ──────────────────────────────────────────────────────────
    if (sort === 'deadline') {
      programs.sort((a, b) => {
        if (a.status === '마감' && b.status !== '마감') return 1
        if (a.status !== '마감' && b.status === '마감') return -1
        return new Date(a.endDate ?? '').getTime() - new Date(b.endDate ?? '').getTime()
      })
    } else {
      programs.sort(
        (a, b) => new Date(b.registeredAt ?? '').getTime() - new Date(a.registeredAt ?? '').getTime()
      )
    }

    const totalCount = programs.length
    const activeCount = programs.filter((p) => p.status === '신청가능').length
    const closedCount = totalCount - activeCount
    const allFields = [...new Set(programs.map((p) => p.field).filter(Boolean))] as string[]

    const totalPages = Math.ceil(totalCount / perPage)
    const start = (page - 1) * perPage
    const paginated = programs.slice(start, start + perPage)

    return NextResponse.json({
      page, perPage, totalPages, totalCount, activeCount, closedCount,
      programs: paginated,
      fields: allFields.slice(0, 30),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'API 호출 실패: ' + String(e) }, { status: 500 })
  }
}
