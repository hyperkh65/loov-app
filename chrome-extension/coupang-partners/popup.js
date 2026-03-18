const fields = ['notionApiKey', 'notionDatabaseId', 'partnersPassword'];
const DEFAULTS = {
  notionApiKey: '',
  notionDatabaseId: '3251f4ff-9a0e-811b-a5b1-e4ed9ab38dcd',
  partnersPassword: '',
};

// 설정 로드
chrome.storage.sync.get(fields, (data) => {
  fields.forEach(f => {
    document.getElementById(f).value = data[f] || DEFAULTS[f] || '';
  });
  const needsSave = fields.some(f => !data[f] && DEFAULTS[f]);
  if (needsSave) chrome.storage.sync.set(DEFAULTS);
});

// 설정 저장
document.getElementById('saveBtn').addEventListener('click', () => {
  const data = {};
  fields.forEach(f => { data[f] = document.getElementById(f).value.trim(); });
  chrome.storage.sync.set(data, () => {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });
});

// ── 파트너스 페이지 수집 ──────────────────────────────────────────────────
document.getElementById('partnersCollectBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://partners.coupang.com/*' });
  const partnersTab = tabs[0];

  if (!partnersTab) {
    document.getElementById('partnersNotice').style.display = 'block';
    return;
  }

  document.getElementById('partnersNotice').style.display = 'none';

  const btn = document.getElementById('partnersCollectBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> 수집중...';
  document.getElementById('partnersStopBtn').style.display = 'block';
  document.getElementById('partnersProgress').style.display = 'block';
  document.getElementById('partnersLog').style.display = 'block';
  document.getElementById('partnersLog').innerHTML = '';

  const maxItems = parseInt(document.getElementById('maxItems').value) || 20;
  const password = document.getElementById('partnersPassword').value.trim();

  try {
    await chrome.tabs.sendMessage(partnersTab.id, {
      type: 'AUTO_COLLECT_PARTNERS', maxItems, password
    });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: partnersTab.id },
      files: ['partners-content.js']
    });
    await new Promise(r => setTimeout(r, 300));
    chrome.tabs.sendMessage(partnersTab.id, {
      type: 'AUTO_COLLECT_PARTNERS', maxItems, password
    });
  }
});

// 파트너스 수집 중단
document.getElementById('partnersStopBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://partners.coupang.com/*' });
  if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_COLLECT' });
  const btn = document.getElementById('partnersCollectBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏸</span> 중단 중...';
  document.getElementById('partnersStopBtn').style.display = 'none';
});

// ── 쿠팡 일반 수집 ────────────────────────────────────────────────────────
document.getElementById('collectBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://www.coupang.com/*' });
  const coupangTab = tabs[0];

  if (!coupangTab) {
    document.getElementById('notice').style.display = 'block';
    return;
  }

  document.getElementById('notice').style.display = 'none';

  const btn = document.getElementById('collectBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> 수집중...';
  document.getElementById('stopBtn').style.display = 'block';
  document.getElementById('progress').style.display = 'block';
  document.getElementById('log').style.display = 'block';
  document.getElementById('log').innerHTML = '';

  const maxPages = parseInt(document.getElementById('maxPages').value) || 5;

  try {
    await chrome.tabs.sendMessage(coupangTab.id, { type: 'AUTO_COLLECT', maxPages });
  } catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: coupangTab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 300));
    chrome.tabs.sendMessage(coupangTab.id, { type: 'AUTO_COLLECT', maxPages });
  }
});

// 쿠팡 수집 중단
document.getElementById('stopBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://www.coupang.com/*' });
  const coupangTab = tabs[0];
  if (coupangTab) chrome.tabs.sendMessage(coupangTab.id, { type: 'STOP_COLLECT' });
  const btn = document.getElementById('collectBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏸</span> 중단 중...';
  document.getElementById('stopBtn').style.display = 'none';
});

// ── 진행상황 수신 ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'COLLECT_PROGRESS') {
    const { current, total, name, status } = msg;
    const pct = total ? Math.round((current / total) * 100) : 0;

    // 파트너스 또는 쿠팡 구분 (파트너스는 total이 items 기준)
    const isPartners = document.getElementById('partnersCollectBtn').disabled;

    if (isPartners) {
      document.getElementById('partnersProgressBar').style.width = pct + '%';
      document.getElementById('partnersProgressText').textContent = `${current} / ${total} 처리중...`;
      const log = document.getElementById('partnersLog');
      const div = document.createElement('div');
      div.className = status === 'ok' ? 'ok' : (status === 'processing' ? '' : 'err');
      div.textContent = `${status === 'ok' ? '✅' : status === 'processing' ? '⏳' : '❌'} ${name}`;
      log.prepend(div);
    } else {
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressText').textContent = `${current} / ${total} 처리중...`;
      const log = document.getElementById('log');
      const div = document.createElement('div');
      div.className = status === 'ok' ? 'ok' : 'err';
      div.textContent = `${status === 'ok' ? '✅' : '❌'} ${name}`;
      log.prepend(div);
    }
  }

  if (msg.type === 'COLLECT_DONE') {
    // 파트너스 버튼 복구
    const partnersBtn = document.getElementById('partnersCollectBtn');
    if (partnersBtn.disabled) {
      partnersBtn.disabled = false;
      document.getElementById('partnersStopBtn').style.display = 'none';
      if (msg.stopped) {
        partnersBtn.innerHTML = '<span>⏹</span> 중단됨 - 다시 시작하려면 클릭';
        document.getElementById('partnersProgressText').textContent = `중단: ${msg.success}개 저장, ${msg.fail}개 실패`;
      } else {
        partnersBtn.innerHTML = '<span>✅</span> 완료! 다시 수집하려면 클릭';
        document.getElementById('partnersProgressText').textContent = `완료: ${msg.success}개 저장, ${msg.fail}개 실패`;
      }
    }

    // 쿠팡 버튼 복구
    const btn = document.getElementById('collectBtn');
    if (btn.disabled) {
      btn.disabled = false;
      document.getElementById('stopBtn').style.display = 'none';
      if (msg.stopped) {
        btn.innerHTML = '<span>⏹</span> 중단됨 - 다시 시작하려면 클릭';
        document.getElementById('progressText').textContent = `중단: ${msg.success}개 저장, ${msg.fail}개 실패`;
      } else {
        btn.innerHTML = '<span>✅</span> 완료! 다시 수집하려면 클릭';
        document.getElementById('progressText').textContent = `완료: ${msg.success}개 저장, ${msg.fail}개 실패`;
      }
    }
  }
});
