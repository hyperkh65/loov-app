'use client';

import { useState, useEffect, useCallback } from 'react';

type Tab = 'write' | 'history' | 'settings';

interface MenuItem {
  menuId: number;
  menuName: string;
  menuType: string;
}

interface CafeConnection {
  connected: boolean;
  oauth_connected: boolean;
  club_id?: string;
  cafe_name?: string;
  cafe_url?: string;
  member_id?: string;
  menu_list?: MenuItem[];
  updated_at?: string;
}

interface HistoryItem {
  id: string;
  title: string;
  article_id: string | null;
  article_url: string | null;
  menu_name: string | null;
  open_yn: string;
  created_at: string;
}

const OPEN_OPTIONS: { val: 'Y' | 'N'; label: string }[] = [
  { val: 'Y', label: '🌐 공개' },
  { val: 'N', label: '🔒 비공개' },
];

function htmlToPlainText(html: string): string {
  return html
    .replace(/<h[1-3][^>]*>/gi, '\n\n## ')
    .replace(/<\/h[1-3]>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function NaverCafePage() {
  const [tab, setTab] = useState<Tab>('write');
  const [conn, setConn] = useState<CafeConnection>({ connected: false, oauth_connected: false });
  const [loadingConn, setLoadingConn] = useState(true);
  const [oauthSuccess, setOauthSuccess] = useState(false);

  // settings (localStorage)
  const [clubId, setClubId] = useState('');
  const [cafeName, setCafeName] = useState('');
  const [cafeUrl, setCafeUrl] = useState('');
  const [cafeSlugInput, setCafeSlugInput] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('30a1f4ff-9a0e-8030-aade-f3de90c1e3ed');
  const [ollamaKey, setOllamaKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');

  // 노션 AI 뉴스 DB
  interface NotionArticle { id: string; title: string; status: string; lastEdited: string; coverImg?: string; }
  const [notionArticles, setNotionArticles] = useState<NotionArticle[]>([]);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionContentLoading, setNotionContentLoading] = useState(false);
  const [showNotionList, setShowNotionList] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  // 수동 메뉴 추가
  const [newMenuId, setNewMenuId] = useState('');
  const [newMenuName, setNewMenuName] = useState('');
  const [savingMenus, setSavingMenus] = useState(false);

  // AI 리라이팅
  const [rewriting, setRewriting] = useState(false);
  const [aiModel, setAiModel] = useState('qwen3');

  // write
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [menuId, setMenuId] = useState('');
  const [openYn, setOpenYn] = useState<'Y' | 'N'>('Y');
  const [attachFiles, setAttachFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok?: boolean; url?: string; error?: string } | null>(null);

  // history
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadConn = useCallback(async () => {
    setLoadingConn(true);
    const res = await fetch('/api/naver-cafe/connect');
    const data: CafeConnection = await res.json();
    setConn(data);
    if (data.club_id) setClubId(data.club_id);
    if (data.cafe_name) setCafeName(data.cafe_name);
    if (data.cafe_url) { setCafeUrl(data.cafe_url); setCafeSlugInput(data.cafe_url); }
    setLoadingConn(false);
  }, []);

  const resolveClubId = async () => {
    const slug = cafeSlugInput.trim().replace(/^https?:\/\/cafe\.naver\.com\//, '').replace(/\/$/, '');
    if (!slug) { setSettingsMsg('카페 URL을 입력하세요'); return; }
    setResolving(true);
    setSettingsMsg('');
    const res = await fetch(`/api/naver-cafe/resolve?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (data.club_id) {
      setClubId(data.club_id);
      if (data.cafe_name) setCafeName(data.cafe_name);
      setCafeUrl(slug);
      setSettingsMsg(`✅ 카페 ID 조회 성공: ${data.club_id} (${data.cafe_name})`);
    } else {
      setSettingsMsg(`❌ ${data.error}`);
    }
    setResolving(false);
  };

  const loadNotionArticles = async () => {
    if (!notionToken) { alert('설정 탭에서 Notion API 키를 먼저 입력하세요'); setTab('settings'); return; }
    setNotionLoading(true);
    try {
      const params = new URLSearchParams({ action: 'list', token: notionToken, dbId: notionDbId });
      const r = await fetch(`/api/naver-cafe/notion-news?${params}`);
      const d = await r.json();
      if (!r.ok) { alert(d.error || '노션 로드 실패'); setNotionLoading(false); return; }
      setNotionArticles(d.articles || []);
      setShowNotionList(true);
    } catch (e) { alert('노션 로드 실패: ' + String(e)); }
    setNotionLoading(false);
  };

  const selectNotionArticle = async (article: NotionArticle) => {
    setTitle(article.title);
    setShowNotionList(false);
    setAttachFiles([]);
    setCoverImageUrl('');
    setContent('');
    setNotionContentLoading(true);

    try {
      const params = new URLSearchParams({ action: 'content', token: notionToken, pageId: article.id });
      const r = await fetch(`/api/naver-cafe/notion-news?${params}`);
      const d = await r.json();
      if (!r.ok) {
        alert('내용 로딩 실패: ' + (d.error || r.status));
        setNotionContentLoading(false);
        return;
      }
      const text = d.html || '';
      setContent(text ? htmlToPlainText(text) : '(노션 페이지 내용이 비어 있습니다. 직접 입력하세요)');

      // 커버이미지 자동 설정
      const imgUrl = article.coverImg || d.coverImg || '';
      if (imgUrl) setCoverImageUrl(imgUrl);
    } catch (e) {
      alert('내용 로딩 중 오류: ' + String(e));
    } finally {
      setNotionContentLoading(false);
    }
  };

  const rewriteWithAI = async () => {
    if (!content.trim()) { alert('먼저 내용을 불러오세요'); return; }
    setRewriting(true);
    const prompt = `다음 AI 뉴스 기사를 네이버 카페 독자에게 적합하게 다듬어 주세요.

제목: ${title}

원문:
${content.slice(0, 3000)}

규칙:
- 반말/1인칭 금지, 과장 금지
- HTML 태그 절대 사용 금지 (plain text만)
- 소제목은 ## 으로 표시
- 목록은 • 으로 표시
- 마지막에 해시태그 3~5개
- 원문 내용 유지하되 더 읽기 쉽게

plain text 본문만 출력하세요. HTML 태그 없이.`;

    const prevContent = content; // 원본 백업
    try {
      const r = await fetch('/api/free-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModel,
          clientOllamaKey: ollamaKey,
          clientOpenrouterKey: openrouterKey,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.body) throw new Error('스트림 없음');
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = ''; let full = ''; let apiError = '';
      setContent('');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            if (j.chunk) { full += j.chunk; setContent(full); }
            if (j.error) apiError = j.error;
          } catch {}
        }
      }
      if (!full.trim()) {
        setContent(prevContent);
        alert(apiError || 'AI 응답이 없습니다. 설정 탭에서 Ollama 또는 OpenRouter API 키를 입력하세요.');
      }
    } catch (e) {
      setContent(prevContent);
      alert('리라이팅 오류: ' + String(e));
    }
    setRewriting(false);
  };

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await fetch('/api/naver-cafe/articles');
    const data = await res.json();
    setHistory(data.items || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    // localStorage에서 API 키 복원
    setNotionToken(localStorage.getItem('cafe_notion_token') || '');
    setNotionDbId(localStorage.getItem('cafe_notion_dbid') || '30a1f4ff-9a0e-8030-aade-f3de90c1e3ed');
    setOllamaKey(localStorage.getItem('freeai_ollama_key') || '');
    setOpenrouterKey(localStorage.getItem('cafe_openrouter_key') || '');
    loadConn();
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
      setOauthSuccess(true);
      setTab('settings');
      window.history.replaceState({}, '', '/dashboard/naver-cafe');
    }
    if (params.get('error')) {
      setSettingsMsg('OAuth 연결 실패. 다시 시도해주세요.');
      setTab('settings');
      window.history.replaceState({}, '', '/dashboard/naver-cafe');
    }
  }, [loadConn]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const saveSettings = async () => {
    // localStorage에 API 키 저장
    localStorage.setItem('cafe_notion_token', notionToken);
    localStorage.setItem('cafe_notion_dbid', notionDbId);
    localStorage.setItem('freeai_ollama_key', ollamaKey);
    localStorage.setItem('cafe_openrouter_key', openrouterKey);

    if (!clubId) { setSettingsMsg('✅ API 키 저장됨 (카페 ID를 입력하면 카페 설정도 저장됩니다)'); return; }
    setSavingConn(true);
    const res = await fetch('/api/naver-cafe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: clubId, cafe_name: cafeName, cafe_url: cafeUrl }),
    });
    const data = await res.json();
    setSettingsMsg(data.ok ? '✅ 모든 설정 저장됨' : `❌ ${data.error}`);
    if (data.ok) loadConn();
    setSavingConn(false);
  };

  const addMenu = async () => {
    const id = newMenuId.trim();
    const name = newMenuName.trim();
    if (!id || !name) { setSettingsMsg('게시판 ID와 이름을 모두 입력하세요'); return; }
    setSavingMenus(true);
    const currentMenus: MenuItem[] = conn.menu_list || [];
    if (currentMenus.find(m => String(m.menuId) === id)) {
      setSettingsMsg('이미 추가된 게시판 ID입니다'); setSavingMenus(false); return;
    }
    const newMenus = [...currentMenus, { menuId: Number(id), menuName: name, menuType: 'text' }];
    const res = await fetch('/api/naver-cafe/menus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menus: newMenus }),
    });
    const data = await res.json();
    if (data.ok) { setSettingsMsg('✅ 게시판 추가됨'); setNewMenuId(''); setNewMenuName(''); loadConn(); }
    else { setSettingsMsg(`❌ ${data.error}`); }
    setSavingMenus(false);
  };

  const removeMenu = async (menuId: number) => {
    const newMenus = (conn.menu_list || []).filter(m => m.menuId !== menuId);
    await fetch('/api/naver-cafe/menus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menus: newMenus }),
    });
    loadConn();
  };

  const doPublish = async () => {
    if (!title.trim() || !content.trim()) { alert('제목과 내용을 입력하세요'); return; }
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/naver-cafe/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, menu_id: menuId || undefined, open_yn: openYn, cover_image_url: coverImageUrl || undefined }),
      });
      const data = await res.json();
      setPublishResult(data);
      if (data.ok) { setTitle(''); setContent(''); }
    } catch (e) {
      setPublishResult({ error: String(e) });
    } finally {
      setPublishing(false);
    }
  };

  const menus: MenuItem[] = conn.menu_list || [];

  const TAB_ITEMS: { key: Tab; label: string }[] = [
    { key: 'write', label: '✏️ 글쓰기' },
    { key: 'history', label: '📋 발행 이력' },
    { key: 'settings', label: '⚙️ 설정' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">☕ 네이버 카페 관리</h1>
        <p className="text-sm text-gray-500 mt-1">네이버 카페 글 작성, 발행, 이력 관리</p>
      </div>

      {oauthSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          ✅ 네이버 OAuth 연결 성공! 아래에서 게시판 목록을 불러오세요.
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {TAB_ITEMS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 설정 탭 */}
      {tab === 'settings' && (
        <div className="space-y-4">
          {/* 연결 상태 */}
          <div
            className={`p-4 rounded-xl border ${
              conn.oauth_connected ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <p className="text-sm font-semibold">
              {loadingConn ? '확인 중...' : conn.oauth_connected ? '✅ OAuth 연결됨' : '⚠️ OAuth 미연결'}
            </p>
            {conn.oauth_connected && conn.member_id && (
              <p className="text-xs text-gray-600 mt-1">
                회원 ID: {conn.member_id} · 카페: {conn.cafe_name || conn.club_id}
              </p>
            )}
            {!conn.oauth_connected && (
              <p className="text-xs text-gray-500 mt-1">아래에서 카페 ID 저장 후 OAuth 연결하세요</p>
            )}
          </div>

          {/* 카페 정보 입력 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">카페 정보</p>

            {/* URL 자동 조회 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">카페 URL</label>
              <div className="flex gap-2">
                <input
                  value={cafeSlugInput}
                  onChange={(e) => setCafeSlugInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && resolveClubId()}
                  placeholder="예: 2dayskr 또는 cafe.naver.com/2dayskr"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={resolveClubId}
                  disabled={resolving}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {resolving ? '조회 중...' : '🔍 자동 조회'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">카페 URL만 입력하면 숫자 ID를 자동으로 가져옵니다</p>
            </div>

            {/* 조회된 결과 표시 */}
            {clubId && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">카페 ID</span>
                  <span className="font-mono font-semibold text-gray-800">{clubId}</span>
                </div>
                {cafeName && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">카페 이름</span>
                    <span className="text-gray-800">{cafeName}</span>
                  </div>
                )}
                {cafeUrl && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">URL</span>
                    <span className="text-gray-800">cafe.naver.com/{cafeUrl}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={saveSettings}
              disabled={savingConn || !clubId}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {savingConn ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>

          {/* OAuth 연결 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">네이버 OAuth 연결</p>
            <p className="text-xs text-gray-500">
              카페 글 작성 권한을 위해 네이버 계정으로 로그인하세요. 카페 ID를 먼저 저장하세요.
            </p>
            <a
              href={`/api/naver-cafe/oauth/connect?club_id=${clubId}`}
              className="block w-full py-2.5 bg-green-500 text-white rounded-lg text-sm font-bold text-center hover:bg-green-600"
            >
              🟢 네이버로 로그인 (OAuth)
            </a>
            {conn.oauth_connected && (
              <button
                onClick={async () => {
                  await fetch('/api/naver-cafe/connect', { method: 'DELETE' });
                  setConn({ connected: false, oauth_connected: false });
                  setSettingsMsg('연결 해제됨');
                }}
                className="w-full py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100"
              >
                🔌 연결 해제
              </button>
            )}
          </div>

          {/* 게시판 수동 추가 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">게시판 목록</p>
              <p className="text-xs text-gray-400 mt-0.5">
                네이버 카페 API는 게시판 자동 조회를 지원하지 않습니다. 카페에서 직접 확인 후 추가하세요.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">게시판 ID 확인 방법</p>
              <p>카페 게시판 클릭 → URL 마지막 숫자</p>
              <p className="text-blue-500 break-all">예: cafe.naver.com/f-e/cafes/30929054/menus/<strong>15</strong></p>
            </div>
            <div className="flex gap-2">
              <input
                value={newMenuId}
                onChange={e => setNewMenuId(e.target.value)}
                placeholder="게시판 ID (숫자)"
                className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                value={newMenuName}
                onChange={e => setNewMenuName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMenu()}
                placeholder="게시판 이름"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addMenu}
                disabled={savingMenus}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                추가
              </button>
            </div>
            {menus.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {menus.map((m) => (
                  <div key={m.menuId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                    <span className="font-medium text-gray-700">{m.menuName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">ID: {m.menuId}</span>
                      <button onClick={() => removeMenu(m.menuId)} className="text-red-400 hover:text-red-600">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API 키 설정 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">🔑 API 키 설정</p>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notion API 키 (Integration Token)</label>
              <input value={notionToken} onChange={e => setNotionToken(e.target.value)}
                placeholder="secret_xxxx..."
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notion DB ID (AI 뉴스)</label>
              <input value={notionDbId} onChange={e => setNotionDbId(e.target.value)}
                placeholder="30a1f4ff-9a0e-8030-aade-f3de90c1e3ed"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ollama Cloud API 키 (리라이팅용)</label>
              <input value={ollamaKey} onChange={e => setOllamaKey(e.target.value)}
                placeholder="ollama cloud api key..."
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">OpenRouter API 키 (선택, 폴백용)</label>
              <input value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)}
                placeholder="sk-or-v1-..."
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {settingsMsg && (
            <p className={`text-sm text-center ${settingsMsg.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
              {settingsMsg}
            </p>
          )}
        </div>
      )}

      {/* 글쓰기 탭 */}
      {tab === 'write' && (
        <div className="space-y-4">
          {!conn.oauth_connected && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
              ⚠️ 설정 탭에서 OAuth 연결이 필요합니다.
            </div>
          )}

          {/* 노션 AI 뉴스 불러오기 */}
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-violet-700">📰 노션 AI 뉴스에서 불러오기</p>
              <button onClick={loadNotionArticles} disabled={notionLoading}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
                {notionLoading ? '로딩...' : '목록 불러오기'}
              </button>
            </div>
            {showNotionList && notionArticles.length > 0 && (
              <div className="max-h-56 overflow-y-auto space-y-1 mt-2">
                {notionArticles.map(a => (
                  <button key={a.id} onClick={() => selectNotionArticle(a)}
                    className="w-full text-left px-3 py-2 bg-white hover:bg-violet-50 rounded-lg border border-violet-100 transition-colors flex items-center gap-2">
                    {a.coverImg && <img src={a.coverImg} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800 text-xs block truncate">{a.title}</span>
                      <span className="text-[10px] text-gray-400">{a.status} · {new Date(a.lastEdited).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showNotionList && notionArticles.length === 0 && (
              <p className="text-xs text-violet-500 mt-1">노션 DB에 아티클이 없습니다</p>
            )}
          </div>

          {/* AI 리라이팅 */}
          {content && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-700">🤖 AI 리라이팅 (Ollama)</p>
              <div className="flex gap-2 flex-wrap">
                {['qwen3', 'llama3.3', 'mistral', 'gemma3'].map(m => (
                  <button key={m} onClick={() => setAiModel(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${aiModel === m ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={rewriteWithAI} disabled={rewriting}
                className="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all">
                {rewriting ? '리라이팅 중...' : '✨ 리라이팅하기'}
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            {/* 커버이미지 (노션에서 자동 로드) */}
            {coverImageUrl && (
              <div className="relative">
                <img src={coverImageUrl} alt="커버" className="w-full h-32 object-cover rounded-lg" />
                <button onClick={() => setCoverImageUrl('')}
                  className="absolute top-1 right-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded">✕ 제거</button>
              </div>
            )}

            {/* 제목 */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">제목 *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="글 제목을 입력하세요"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 게시판 선택 */}
            {menus.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">게시판</label>
                <select
                  value={menuId}
                  onChange={(e) => setMenuId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">게시판 선택 (선택 없음 = 기본)</option>
                  {menus.map((m) => (
                    <option key={m.menuId} value={String(m.menuId)}>{m.menuName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 공개 설정 */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-2 block">공개 설정</label>
              <div className="flex gap-4">
                {OPEN_OPTIONS.map(({ val, label }) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={openYn === val}
                      onChange={() => setOpenYn(val)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 내용 */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">내용 *{notionContentLoading && <span className="ml-2 text-violet-500 font-normal">노션에서 불러오는 중...</span>}</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                placeholder="글 내용을 입력하세요. HTML 태그 사용 가능합니다."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none font-mono"
              />
            </div>

            {/* 파일/이미지 첨부 */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">파일/이미지 첨부 (최대 5개)</label>
              <label className="flex items-center gap-2 w-full cursor-pointer border border-dashed border-gray-300 rounded-lg px-3 py-3 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <span className="text-lg">📎</span>
                <span className="text-sm text-gray-500">
                  {attachFiles.length > 0 ? `${attachFiles.length}개 선택됨 (클릭으로 추가)` : '이미지, PDF, 문서 등 모든 파일 선택 가능'}
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []).slice(0, 5 - attachFiles.length);
                    const results = await Promise.all(files.map(f => new Promise<{ name: string; base64: string; type: string }>((res) => {
                      const reader = new FileReader();
                      reader.onload = () => res({ name: f.name, base64: (reader.result as string).split(',')[1], type: f.type || 'application/octet-stream' });
                      reader.readAsDataURL(f);
                    })));
                    setAttachFiles(prev => [...prev, ...results].slice(0, 5));
                    e.target.value = '';
                  }}
                />
              </label>
              {attachFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachFiles.map((f, i) => {
                    const isImage = f.type.startsWith('image/');
                    return (
                      <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1 text-xs">
                        <span className="mr-0.5">{isImage ? '🖼️' : '📄'}</span>
                        <span className="text-gray-600 max-w-[120px] truncate">{f.name}</span>
                        <button onClick={() => setAttachFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={doPublish}
              disabled={publishing || !conn.oauth_connected || !title || !content}
              className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {publishing ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span>발행 중...</span>
                </>
              ) : (
                '🚀 카페에 발행하기'
              )}
            </button>
          </div>

          {publishResult && (
            <div
              className={`p-4 rounded-xl border text-sm ${
                publishResult.ok
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {publishResult.ok ? (
                <>
                  <p className="font-semibold">✅ 카페 발행 완료!</p>
                  {publishResult.url && (
                    <a
                      href={publishResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-xs mt-1 block"
                    >
                      {publishResult.url}
                    </a>
                  )}
                </>
              ) : (
                <p>❌ {publishResult.error}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 발행 이력 탭 */}
      {tab === 'history' && (
        <div>
          {loadingHistory ? (
            <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">발행 이력이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.menu_name && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                            {item.menu_name}
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            item.open_yn === 'Y' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'
                          }`}
                        >
                          {item.open_yn === 'Y' ? '공개' : '비공개'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(item.created_at).toLocaleString('ko-KR')}
                        </span>
                      </div>
                    </div>
                    {item.article_url && (
                      <a
                        href={item.article_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 flex-shrink-0"
                      >
                        🔗 보기
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
