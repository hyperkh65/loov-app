import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

export const maxDuration = 30;

const ALL_STEPS = [
  'mkdir',
  'db',
  'download',
  'wpcli',
  'config',
  'install',
  'theme',
  'plugins',
  'adsense',
  'settings',
  'seo',
  'cache',
  'perms',
] as const;

type StepName = typeof ALL_STEPS[number];
type StepStatus = 'pending' | 'running' | 'ok' | 'error';

interface ParsedStep {
  name: StepName;
  status: StepStatus;
}

function parseLog(logContent: string): {
  lines: string[];
  done: boolean;
  success: boolean;
  steps: ParsedStep[];
} {
  const lines = logContent.split('\n').filter(Boolean);

  // Initialize all steps as pending
  const stepMap: Record<StepName, StepStatus> = {} as Record<StepName, StepStatus>;
  for (const s of ALL_STEPS) {
    stepMap[s] = 'pending';
  }

  let done = false;
  let success = false;
  let currentRunning: StepName | null = null;

  for (const line of lines) {
    // [STEP:xxx] — step started (running)
    const startMatch = line.match(/^\[STEP:([a-z]+)\]\s/);
    if (startMatch) {
      const name = startMatch[1] as StepName;
      if (ALL_STEPS.includes(name)) {
        stepMap[name] = 'running';
        currentRunning = name;
      }
      continue;
    }

    // [STEP:xxx:OK] — step completed OK
    const okMatch = line.match(/^\[STEP:([a-z]+):OK\]/);
    if (okMatch) {
      const name = okMatch[1] as StepName;
      if (ALL_STEPS.includes(name)) {
        stepMap[name] = 'ok';
        if (currentRunning === name) currentRunning = null;
      }
      continue;
    }

    // [STEP:xxx:ERROR] — step error
    const errMatch = line.match(/^\[STEP:([a-z]+):ERROR\]/);
    if (errMatch) {
      const name = errMatch[1] as StepName;
      if (ALL_STEPS.includes(name)) {
        stepMap[name] = 'error';
        if (currentRunning === name) currentRunning = null;
      }
      continue;
    }

    // [DONE:OK] or [DONE:ERROR]
    if (line.startsWith('[DONE:OK]')) {
      done = true;
      success = true;
      continue;
    }
    if (line.startsWith('[DONE:ERROR]')) {
      done = true;
      success = false;
      continue;
    }
  }

  // If a step is still "running" but not yet completed (log truncated mid-run)
  // leave it as running — UI shows spinner

  const steps: ParsedStep[] = ALL_STEPS.map((name) => ({
    name,
    status: stepMap[name],
  }));

  return { lines, done, success, steps };
}

export async function GET(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('job');

  if (!jobId) {
    return NextResponse.json({ error: 'job 파라미터가 필요합니다' }, { status: 400 });
  }

  // Validate jobId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(jobId)) {
    return NextResponse.json({ error: '잘못된 job ID입니다' }, { status: 400 });
  }

  const logPath = `/volume1/web/.wp-setup-logs/${jobId}.log`;

  try {
    const result = await nasExec(`cat "${logPath}" 2>/dev/null || echo "[INFO] 로그 파일 없음 (아직 시작 안됨)"`);

    if (result.code !== 0 && !result.stdout) {
      return NextResponse.json({
        lines: ['[INFO] 로그 파일을 아직 읽을 수 없습니다. 잠시 후 다시 시도하세요.'],
        done: false,
        success: false,
        steps: ALL_STEPS.map((name) => ({ name, status: 'pending' as StepStatus })),
      });
    }

    const parsed = parseLog(result.stdout);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Status check error:', err);
    return NextResponse.json({ error: `NAS 연결 오류: ${String(err)}` }, { status: 500 });
  }
}
