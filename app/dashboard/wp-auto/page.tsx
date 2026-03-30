'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const TOPICS = [
  '뉴스/이슈', '재테크/투자', 'IT/기술', '건강/의료', '여행/맛집',
  '라이프스타일', '패션/뷰티', '육아/교육', '자동차', '부동산',
  '요리/레시피', '스포츠', '연예/엔터', '반려동물', '기타',
];

interface LogEntry { type: string; msg: string; ts: number; }
interface Site {
  name: string; domain: string; url: string;
  adminUrl: string; createdAt: string | null; size: string;
}

function genPass() {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#';
  return Array.from({ length: 14 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

export default function WpAutoPage() {
  const [tab, setTab] = useState<'new' | 'sites'>('new');
  const [sub, setSub] = useState('');
  const [siteTitle, setSiteTitle] = useState('');
  const [topic, setTopic] = useState(TOPICS[0]);
  const [adminPass, setAdminPass] = useState(genPass);
  const [showPass, setShowPass] = useState(false);

  const [checking, setChecking] = useState(false);
  const [domainOk, setDomainOk] = useState<boolean | null>(null);
  const [checkMsg, setCheckMsg] = useState('');

  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // 도메인 변경 시 체크 초기화
  useEffect(() => { setDomainOk(null); setCheckMsg(''); }, [sub]);

  const checkDomain = async () => {
    if (!sub) return;
    setChecking(true);
    setDomainOk(null);
    try {
      const res = await fetch(`/api/wp-auto/check?domain=${sub}`);
      const data = await res.json();
      if (data.error) { setDomainOk(false); setCheckMsg(data.error); }
      else { setDomainOk(data.available); setCheckMsg(data.available ? '사용 가능!' : '이미 사용 중'); }
    } catch (e) {
      setDomainOk(false); setCheckMsg(String(e));
    } finally { setChecking(false); }
  };

  const loadSites = useCallback(async () => {
    setSitesLoading(true);
    try {
      const res = await fetch('/api/wp-auto/sites');
      const data = await res.json();
      setSites(data.sites || []);
    } finally { setSitesLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'sites') loadSites(); }, [tab, loadSites]);

  const startSetup = async () => {
    if (!sub || !siteTitle || domainOk !== true) return;
    setRunning(true);
    setLogs([]);
    setResult(null);

    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/wp-auto/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: sub, title: siteTitle, topic, adminPass }),
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'done') {
              try { setResult(JSON.parse(ev.msg)); } catch { setResult({ info: ev.msg }); }
            } else {
              setLogs(prev => [...prev, { ...ev, ts: Date.now() }]);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setLogs(prev => [...prev, { type: 'error', msg: String(e), ts: Date.now() }]);
      }
    } finally {
      setRunning(false);
    }
  };

  const isValid = sub && siteTitle && domainOk === true && !running;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              🌐 WordPress 자동세팅
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              hy64 NAS · <span className="font-mono">*.aboda.kr</span> · GeneratePress + AdSense 최적화
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              ca-pub-8940400388075870
            </span>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mt-4">
          {(['new', 'sites'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}>
              {t === 'new' ? '✨ 새 사이트 만들기' : `📋 사이트 목록 ${sites.length > 0 ? `(${sites.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {/* ── 새 사이트 탭 ── */}
        {tab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 설정 폼 */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black">1</span>
                  도메인 설정
                </h2>

                {/* 서브도메인 입력 */}
                <label className="block text-sm font-medium text-gray-700 mb-1.5">서브도메인</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent">
                    <input
                      type="text"
                      value={sub}
                      onChange={e => setSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="myblog"
                      className="flex-1 px-3 py-2.5 text-sm outline-none"
                    />
                    <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-l border-gray-200 whitespace-nowrap">.aboda.kr</span>
                  </div>
                  <button
                    onClick={checkDomain}
                    disabled={!sub || checking}
                    className="px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 font-medium whitespace-nowrap transition-colors"
                  >
                    {checking ? '확인 중...' : '중복 확인'}
                  </button>
                </div>

                {/* 중복확인 결과 */}
                {checkMsg && (
                  <div className={`mt-2 text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                    domainOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {domainOk ? '✅' : '❌'} {checkMsg}
                    {domainOk && <span className="text-green-600 font-mono text-xs ml-auto">{sub}.aboda.kr</span>}
                  </div>
                )}

                {/* DNS 안내 */}
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <strong>📌 DNS 수동 설정 필요 (dnszi.com)</strong><br />
                  설치 완료 후 dnszi.com에서 CNAME 레코드 추가:<br />
                  <span className="font-mono">{sub || '[도메인]'} → hy64.synology.me</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black">2</span>
                  사이트 정보
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">블로그 이름 *</label>
                    <input
                      type="text"
                      value={siteTitle}
                      onChange={e => setSiteTitle(e.target.value)}
                      placeholder="예) 재테크 핫이슈"
                      className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">주요 주제 *</label>
                    <select
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white"
                    >
                      {TOPICS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">관리자 비밀번호</label>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent">
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={adminPass}
                          onChange={e => setAdminPass(e.target.value)}
                          className="flex-1 px-3 py-2.5 text-sm outline-none font-mono"
                        />
                        <button onClick={() => setShowPass(!showPass)}
                          className="px-3 text-gray-400 hover:text-gray-600">
                          {showPass ? '🙈' : '👁️'}
                        </button>
                      </div>
                      <button onClick={() => setAdminPass(genPass())}
                        className="px-3 text-sm bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-600 transition-colors" title="새 비밀번호 생성">
                        🔄
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">관리자 ID: admin · 이메일: admin@aboda.kr</p>
                  </div>
                </div>
              </div>

              {/* AdSense 설명 */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black">3</span>
                  AdSense 자동 설정 (수익화)
                </h2>
                <div className="space-y-2 text-sm">
                  {[
                    { pos: '헤더', desc: 'Google Auto Ads 활성화', slot: 'Auto' },
                    { pos: '본문 상단', desc: '아보다 신형', slot: '9071434254' },
                    { pos: '단락 중간', desc: '아보다_5 (2번째 단락 뒤)', slot: '4238744126' },
                    { pos: '본문 하단', desc: '아보다_신형2', slot: '7354479161' },
                    { pos: '사이드바', desc: 'GeneratePress 위젯 영역', slot: '1739739148' },
                  ].map(item => (
                    <div key={item.slot} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="font-medium text-gray-700">{item.pos}</span>
                        <span className="text-gray-400 text-xs ml-2">{item.desc}</span>
                      </div>
                      <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded">
                        {item.slot}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 설치 버튼 */}
              <button
                onClick={startSetup}
                disabled={!isValid}
                className={`w-full py-3.5 text-sm font-bold rounded-2xl transition-all ${
                  isValid
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {running ? '⏳ 설치 진행 중...' : '🚀 WordPress 자동 설치 시작'}
              </button>
              {!domainOk && !running && (
                <p className="text-center text-xs text-gray-400">도메인 중복 확인 후 설치 가능합니다</p>
              )}
            </div>

            {/* 진행 상황 + 결과 */}
            <div className="space-y-4">
              {/* 플러그인 목록 */}
              {!running && logs.length === 0 && !result && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4">📦 자동 설치 구성</h3>
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">테마</div>
                    <div className="flex items-center gap-3 p-2.5 bg-purple-50 rounded-xl">
                      <span className="text-2xl">🎨</span>
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">GeneratePress</div>
                        <div className="text-xs text-gray-500">초경량 고성능 테마 (Core Web Vitals 최적)</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">플러그인</div>
                  <div className="space-y-1.5">
                    {[
                      { icon: '💰', name: 'Advanced Ads', desc: 'AdSense 광고 최적 배치' },
                      { icon: '📈', name: 'Rank Math SEO', desc: '검색엔진 최적화 (무료 최강)' },
                      { icon: '⚡', name: 'LiteSpeed Cache', desc: '캐싱·JS/CSS 최소화·lazy load' },
                      { icon: '🖼️', name: 'Smush', desc: '이미지 자동 최적화 (WebP)' },
                      { icon: '🔒', name: 'Wordfence', desc: '보안 방화벽' },
                      { icon: '🔐', name: 'Really Simple SSL', desc: 'HTTPS 강제 적용' },
                      { icon: '📋', name: 'WP-Optimize', desc: 'DB 최적화·정리' },
                      { icon: '📑', name: 'Table of Contents Plus', desc: '목차 자동 생성 (SEO 향상)' },
                      { icon: '📬', name: 'Contact Form 7', desc: '문의 폼' },
                    ].map(p => (
                      <div key={p.name} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                        <span className="text-base">{p.icon}</span>
                        <div>
                          <span className="text-sm font-medium text-gray-800">{p.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{p.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 진행 로그 */}
              {(running || logs.length > 0) && (
                <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-xl">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      {running ? (
                        <><span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> 설치 진행 중...</>
                      ) : result ? (
                        <><span className="w-2 h-2 bg-green-400 rounded-full" /> 설치 완료</>
                      ) : (
                        <><span className="w-2 h-2 bg-red-400 rounded-full" /> 오류 발생</>
                      )}
                    </span>
                    <span className="text-xs text-gray-500">{logs.length}개 이벤트</span>
                  </div>
                  <div ref={logRef} className="p-4 space-y-1.5 max-h-80 overflow-y-auto font-mono text-xs">
                    {logs.map((log, i) => (
                      <div key={i} className={`flex gap-2 ${
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'warn' ? 'text-yellow-400' :
                        log.type === 'step' ? 'text-cyan-300 font-bold' :
                        'text-gray-300'
                      }`}>
                        <span className="text-gray-600 flex-shrink-0">
                          {new Date(log.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="break-all">{log.msg}</span>
                      </div>
                    ))}
                    {running && (
                      <div className="text-gray-500 animate-pulse">▌</div>
                    )}
                  </div>
                </div>
              )}

              {/* 완료 결과 */}
              {result && (
                <div className="bg-white rounded-2xl border border-green-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">🎉</span>
                    <h3 className="font-bold text-gray-900">WordPress 설치 완료!</h3>
                  </div>
                  <div className="space-y-3">
                    {result.url && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-sm text-gray-600">사이트 URL</span>
                        <a href={result.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-mono text-indigo-600 hover:underline">
                          {result.url} ↗
                        </a>
                      </div>
                    )}
                    {result.adminUrl && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-sm text-gray-600">관리자 패널</span>
                        <a href={result.adminUrl} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-mono text-indigo-600 hover:underline">
                          wp-admin ↗
                        </a>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <span className="text-sm text-gray-600">관리자 계정</span>
                      <span className="text-sm font-mono text-gray-800">admin</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                      <span className="text-sm text-gray-600">비밀번호</span>
                      <span className="text-sm font-mono text-amber-800">{adminPass}</span>
                    </div>
                    {result.dnsNote && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                        <strong>📌 DNS 설정 필요</strong><br />
                        {result.dnsNote}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setSub(''); setSiteTitle(''); setDomainOk(null);
                        setLogs([]); setResult(null); setAdminPass(genPass());
                      }}
                      className="w-full py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors"
                    >
                      + 다음 사이트 만들기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 사이트 목록 탭 ── */}
        {tab === 'sites' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">생성된 WordPress 사이트</h2>
              <button onClick={loadSites} disabled={sitesLoading}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors disabled:opacity-50">
                {sitesLoading ? '로딩...' : '🔄 새로고침'}
              </button>
            </div>

            {sitesLoading ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-3xl mb-2">⏳</div>
                <p>NAS에서 사이트 목록 로딩 중...</p>
              </div>
            ) : sites.length === 0 ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-200">
                <div className="text-4xl mb-3">🌐</div>
                <p className="font-medium">생성된 WordPress 사이트가 없습니다</p>
                <p className="text-sm mt-1">새 사이트 만들기 탭에서 첫 번째 사이트를 만들어 보세요</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sites.map(site => (
                  <div key={site.name} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900">{site.name}</h3>
                        <p className="text-sm text-indigo-600 font-mono">{site.domain}</p>
                      </div>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                        운영 중
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-500 mb-4">
                      <div className="flex justify-between">
                        <span>생성일</span>
                        <span>{site.createdAt ? new Date(site.createdAt).toLocaleDateString('ko-KR') : '알 수 없음'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>용량</span>
                        <span>{site.size}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>경로</span>
                        <span className="font-mono">/volume1/web/{site.name}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={site.url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center py-2 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors">
                        🌐 사이트 방문
                      </a>
                      <a href={site.adminUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-center py-2 text-xs bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors">
                        ⚙️ 관리자
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
