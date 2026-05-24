#!/usr/bin/env node
/**
 * SNS 자동발행 워커 - NAS 크론으로 매 분 실행
 * cron: * * * * * /usr/local/bin/node /volume1/homes/urjent/sns-auto-worker/worker.js >> /volume1/homes/urjent/sns-auto-worker/worker.log 2>&1
 */

const WORKER_SECRET = process.env.WORKER_SECRET || 'SNS_WORKER_SECRET_PLACEHOLDER';
const APP_URL = 'https://loov.co.kr';
const MAX_RUNTIME_MS = 55000; // 55초 후 종료 (다음 크론 실행 전)
const IDLE_SLEEP_MS = 8000;   // 실행할 작업 없을 때 대기

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function tick() {
  try {
    const res = await fetch(`${APP_URL}/api/sns-auto-job/worker/tick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
      signal: AbortSignal.timeout(120000), // Threads 발행 등 최대 120초
    });

    if (!res.ok) {
      log(`Tick 실패 (HTTP ${res.status})`);
      return { processed: false, hasRunningJobs: false, nextRunInMs: IDLE_SLEEP_MS };
    }

    return await res.json();
  } catch (e) {
    log(`Tick 오류: ${e.message}`);
    return { processed: false, hasRunningJobs: false, nextRunInMs: IDLE_SLEEP_MS };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const start = Date.now();
  log('워커 시작');

  while (true) {
    const elapsed = Date.now() - start;
    const remaining = MAX_RUNTIME_MS - elapsed;
    if (remaining <= 1000) break;

    const result = await tick();

    if (result.processed) {
      log(`발행 완료 - 다음 실행까지 ${Math.round((result.nextRunInMs || 0) / 1000)}초`);
    }

    if (!result.hasRunningJobs) {
      // 실행 중인 작업 없음 - 남은 시간 대기 후 종료
      const wait = Math.min(IDLE_SLEEP_MS, MAX_RUNTIME_MS - (Date.now() - start));
      if (wait > 100) await sleep(wait);
      continue;
    }

    const nextWait = result.nextRunInMs || 0;
    const maxWait = MAX_RUNTIME_MS - (Date.now() - start) - 5000;
    const wait = Math.min(nextWait, maxWait);
    if (wait > 100) await sleep(wait);
  }

  log('워커 종료 (타임아웃)');
}

main().catch(e => {
  log(`워커 치명적 오류: ${e.message}`);
  process.exit(1);
});
