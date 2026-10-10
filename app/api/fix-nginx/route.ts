import { NextResponse } from 'next/server'
import { nasExec } from '@/lib/nas-ssh'

export async function GET() {
  try {
    const confs = [
      '/usr/local/etc/nginx/conf.d-available/ed1a7e32-252f-4a5b-81de-9c030190fc7e.w3conf',
      '/usr/local/etc/nginx/conf.d-available/c40852ef-cedf-4572-a4d8-eb2d42e80c7e.w3conf',
    ]

    const results: string[] = []

    for (const conf of confs) {
      // $request_uri → $uri (URL 디코딩 문제 해결)
      const sed = `sudo sed -i 's/set \\$cache_uri \\$request_uri/set \\$cache_uri \\$uri/g' ${conf}`
      const r = await nasExec(sed)
      results.push(`${conf}: ${r || 'ok'}`)
    }

    // nginx 리로드
    const reload = await nasExec('sudo nginx -s reload')
    results.push(`nginx reload: ${reload || 'ok'}`)

    return NextResponse.json({ ok: true, results })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
