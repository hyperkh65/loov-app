import { NextRequest, NextResponse } from 'next/server'
import { nasExec } from '@/lib/nas-ssh'

const LOG_PATH = '/var/packages/DNSServer/target/named/var/log'

interface LogEntry {
  time: string
  ip: string
  domain: string
  type: string
}

function parseLine(line: string): LogEntry | null {
  const m = line.match(
    /^(\d{4}\/\d{2}\/\d{2}) (\d{2}:\d{2}:\d{2})\.\d+ queries: client \S+ (\d+\.\d+\.\d+\.\d+)#\d+ \([^)]+\): query: (\S+) IN (\w+)/
  )
  if (!m) return null
  return { time: m[2], ip: m[3], domain: m[4], type: m[5] }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const grepDate = date.replace(/-/g, '/')

  const cmd = `grep "^${grepDate}" ${LOG_PATH}/query.log ${LOG_PATH}/query.log.1 ${LOG_PATH}/query.log.2 2>/dev/null | head -10000`

  const { stdout, code } = await nasExec(cmd)
  if (code !== 0 && !stdout) {
    return NextResponse.json({ date, entries: [] })
  }

  const entries: LogEntry[] = []
  for (const line of stdout.split('\n')) {
    const entry = parseLine(line)
    if (entry) entries.push(entry)
  }

  return NextResponse.json({ date, entries })
}
