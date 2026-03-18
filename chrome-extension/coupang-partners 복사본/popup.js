const fields = ['notionApiKey', 'notionDatabaseId'];
const DEFAULTS = {
  notionApiKey: 'secret_ihjK120BXx6NWu8lCE01YAEZrS4LLUuoKBdQhpiogOc',
  notionDatabaseId: '3251f4ff-9a0e-811b-a5b1-e4ed9ab38dcd',
};

// 설정 로드 (없으면 기본값 자동 입력)
chrome.storage.sync.get(fields, (data) => {
  fields.forEach(f => {
    document.getElementById(f).value = data[f] || DEFAULTS[f];
  });
  // 기본값이면 자동 저장
  const needsSave = fields.some(f => !data[f]);
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

// 수집 시작
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

  // content script 주입 후 수집 시작
  try {
    await chrome.tabs.sendMessage(coupangTab.id, { type: 'AUTO_COLLECT' });
  } catch(e) {
    // content script 미주입 → 강제 주입 후 재시도
    await chrome.scripting.executeScript({ target: { tabId: coupangTab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 300));
    chrome.tabs.sendMessage(coupangTab.id, { type: 'AUTO_COLLECT' });
  }
});

// 수집 중단
document.getElementById('stopBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://www.coupang.com/*' });
  const coupangTab = tabs[0];
  if (coupangTab) {
    chrome.tabs.sendMessage(coupangTab.id, { type: 'STOP_COLLECT' });
  }
  const btn = document.getElementById('collectBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏸</span> 중단 중...';
  document.getElementById('stopBtn').style.display = 'none';
});

// content script에서 진행상황 수신
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'COLLECT_PROGRESS') {
    const { current, total, name, status } = msg;
    const pct = total ? Math.round((current / total) * 100) : 0;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${current} / ${total} 처리중...`;

    const log = document.getElementById('log');
    const div = document.createElement('div');
    div.className = status === 'ok' ? 'ok' : 'err';
    div.textContent = `${status === 'ok' ? '✅' : '❌'} ${name}`;
    log.prepend(div);
  }

  if (msg.type === 'COLLECT_DONE') {
    const btn = document.getElementById('collectBtn');
    btn.disabled = false;
    document.getElementById('stopBtn').style.display = 'none';
    if (msg.stopped) {
      btn.innerHTML = '<span>⏹</span> 중단됨 - 다시 시작하려면 클릭';
      document.getElementById('progressText').textContent =
        `중단: ${msg.success}개 저장, ${msg.fail}개 실패`;
    } else {
      btn.innerHTML = '<span>✅</span> 완료! 다시 수집하려면 클릭';
      document.getElementById('progressText').textContent =
        `완료: ${msg.success}개 저장, ${msg.fail}개 실패`;
    }
  }
});
