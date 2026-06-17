import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const LOG_DIR = '/nas-dns-log'
const LOG_FILES = ['query.log', 'query.log.1', 'query.log.2']

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

  const entries: LogEntry[] = []

  for (const filename of LOG_FILES) {
    const filePath = path.join(LOG_DIR, filename)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      for (const line of content.split('\n')) {
        if (!line.startsWith(grepDate)) continue
        const entry = parseLine(line)
        if (entry) entries.push(entry)
        if (entries.length >= 10000) break
      }
    } catch {
      // 파일 없으면 skip
    }
  }

  return NextResponse.json({ date, entries })
}
