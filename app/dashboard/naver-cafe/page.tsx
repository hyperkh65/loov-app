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

export default function NaverCafePage() {
  const [tab, setTab] = useState<Tab>('write');
  const [conn, setConn] = useState<CafeConnection>({ connected: false, oauth_connected: false });
  const [loadingConn, setLoadingConn] = useState(true);
  const [oauthSuccess, setOauthSuccess] = useState(false);

  // settings
  const [clubId, setClubId] = useState('');
  const [cafeName, setCafeName] = useState('');
  const [cafeUrl, setCafeUrl] = useState('');
  const [cafeSlugInput, setCafeSlugInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [loadingMenus, setLoadingMenus] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  // write
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [menuId, setMenuId] = useState('');
  const [openYn, setOpenYn] = useState<'Y' | 'N'>('Y');
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

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await fetch('/api/naver-cafe/articles');
    const data = await res.json();
    setHistory(data.items || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
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
    if (!clubId) { setSettingsMsg('카페 ID를 입력하세요'); return; }
    setSavingConn(true);
    const res = await fetch('/api/naver-cafe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: clubId, cafe_name: cafeName, cafe_url: cafeUrl }),
    });
    const data = await res.json();
    setSettingsMsg(data.ok ? '✅ 설정 저장됨' : `❌ ${data.error}`);
    if (data.ok) loadConn();
    setSavingConn(false);
  };

  const loadMenus = async () => {
    setLoadingMenus(true);
    setSettingsMsg('');
    const res = await fetch('/api/naver-cafe/menus');
    const data = await res.json();
    if (data.menus) {
      setSettingsMsg(`✅ 게시판 ${data.menus.length}개 로드됨`);
      loadConn();
    } else {
      setSettingsMsg(`❌ ${data.error}`);
    }
    setLoadingMenus(false);
  };

  const doPublish = async () => {
    if (!title.trim() || !content.trim()) { alert('제목과 내용을 입력하세요'); return; }
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/naver-cafe/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, menu_id: menuId || undefined, open_yn: openYn }),
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

          {/* 게시판 목록 로드 */}
          {conn.oauth_connected && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">게시판 목록</p>
              <button
                onClick={loadMenus}
                disabled={loadingMenus}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingMenus ? '불러오는 중...' : '📋 게시판 목록 불러오기'}
              </button>
              {menus.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {menus.map((m) => (
                    <div key={m.menuId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                      <span className="font-medium text-gray-700">{m.menuName}</span>
                      <span className="text-gray-400">ID: {m.menuId} · {m.menuType}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
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
              <label className="text-xs font-semibold text-gray-600 mb-1 block">내용 * (HTML 가능)</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                placeholder="글 내용을 입력하세요. HTML 태그 사용 가능합니다."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none font-mono"
              />
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
