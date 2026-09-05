'use client';

import { useEffect, useState, useCallback } from 'react';

interface SourceItem {
  id: string;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  status: string;
  discovered_at: string;
  affiliate_sources: { name: string; connector_status: string } | null;
}

export default function DiscoverPage() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const [keyword, setKeyword] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState('');

  const loadItems = useCallback(async () => {
    const res = await fetch('/api/affiliate-engine/import');
    const data = await res.json();
    if (Array.isArray(data)) setItems(data);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  async function submitImport() {
    if (!urlInput.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await fetch('/api/affiliate-engine/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가져오기 실패');
      setUrlInput('');
      await loadItems();
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function runCoupangDiscovery() {
    setDiscovering(true);
    setDiscoverResult('');
    try {
      const res = await fetch('/api/affiliate-engine/discover/coupang', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() || undefined, limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발굴 실패');
      const created = data.results.filter((r: { status: string }) => r.status === 'CREATED').length;
      setDiscoverResult(`✅ ${data.processed}건 처리 (신규 ${created}건) — 상품 목록에서 확인하세요.`);
    } catch (e) {
      setDiscoverResult(`❌ ${(e as Error).message}`);
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <h1 className="text-xl font-bold text-gray-900 mb-4">🔎 발굴</h1>

      {/* 쿠팡 발굴 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">🛒 쿠팡에서 상품 발굴</h2>
        <p className="text-xs text-gray-500 mb-3">키워드를 비우면 골드박스(오늘의 특가)에서 가져옵니다. 발굴 즉시 실제 제휴 리스팅으로 매칭됩니다.</p>
        <div className="flex gap-2">
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="키워드 (선택)"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          <button onClick={runCoupangDiscovery} disabled={discovering}
            className="px-4 py-2 bg-orange-500 text-white text-sm rounded-xl font-semibold disabled:opacity-50">
            {discovering ? '발굴 중...' : '발굴 실행'}
          </button>
        </div>
        {discoverResult && <p className="text-xs mt-2 text-gray-600">{discoverResult}</p>}
      </div>

      {/* 수동 URL 임포트 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">🔗 URL 수동 입력</h2>
        <p className="text-xs text-gray-500 mb-3">TikTok/YouTube/Instagram/Amazon 등 URL을 붙여넣으면 공개 메타데이터(제목/썸네일)만 참고용으로 수집합니다. 영상 파일은 다운로드하지 않습니다.</p>
        <div className="flex gap-2">
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..."
            onKeyDown={e => e.key === 'Enter' && submitImport()}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          <button onClick={submitImport} disabled={importing}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-xl font-semibold disabled:opacity-50">
            {importing ? '가져오는 중...' : '가져오기'}
          </button>
        </div>
        {importError && <p className="text-xs mt-2 text-red-500">{importError}</p>}
      </div>

      <h2 className="text-sm font-bold text-gray-700 mb-2">최근 발굴된 항목</h2>
      {items.length === 0 ? (
        <div className="text-center text-gray-400 py-8 text-sm">아직 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <a key={it.id} href={it.url} target="_blank" rel="noopener noreferrer"
              className="flex gap-3 bg-white border border-gray-200 rounded-xl p-3">
              {it.thumbnail_url ? (
                <img src={it.thumbnail_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{it.title || it.url}</div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {it.affiliate_sources?.name || '알 수 없음'} · {it.status}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
