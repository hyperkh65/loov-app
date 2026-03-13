'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type Category = 'personal' | 'work' | 'secret';

interface GalleryItem {
  id: string;
  category: Category;
  title: string;
  memo: string;
  image_url: string | null;
  notion_page_id: string;
  notion_page_url: string;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

// ── 카테고리 설정 ──────────────────────────────────────────────────────────────
const CAT_CONFIG: Record<Category, { label: string; icon: string; color: string; bg: string; border: string; desc: string }> = {
  personal: { label: '개인용',  icon: '🙋', color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',  desc: '개인 사진 & 메모' },
  work:     { label: '업무용',  icon: '💼', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', desc: '업무 자료 & 레퍼런스' },
  secret:   { label: '비밀용',  icon: '🔒', color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200', desc: '비밀번호로 보호' },
};

// ── 비밀번호 모달 ──────────────────────────────────────────────────────────────
function SecretUnlockModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setLoading(true); setError('');
    const res = await fetch('/api/gallery', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) { onSuccess(); }
    else { const d = await res.json() as { error?: string }; setError(d.error || '오류'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center text-3xl mx-auto mb-3">🔒</div>
          <h2 className="font-black text-lg text-gray-900">비밀 갤러리</h2>
          <p className="text-sm text-gray-400 mt-1">설정에서 등록한 비밀번호를 입력하세요</p>
        </div>
        <input
          type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="비밀번호"
          autoFocus
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-center text-lg tracking-widest focus:border-purple-400 focus:outline-none mb-3"
        />
        {error && <p className="text-sm text-red-500 text-center mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-semibold hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={submit} disabled={loading || !pw}
            className="flex-1 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold disabled:opacity-50 transition-colors">
            {loading ? '확인 중...' : '잠금 해제'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 아이템 추가/편집 모달 ─────────────────────────────────────────────────────
function ItemModal({
  item, defaultCategory, onSave, onClose,
}: {
  item?: GalleryItem | null;
  defaultCategory: Category;
  onSave: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category>(item?.category || defaultCategory);
  const [title, setTitle] = useState(item?.title || '');
  const [memo, setMemo] = useState(item?.memo || '');
  const [tags, setTags] = useState((item?.tags || []).join(', '));
  const [notionUrl] = useState(item?.notion_page_url || '');
  const [imageUrl, setImageUrl] = useState(item?.image_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(item?.image_url || '');
  const fileRef = useRef<HTMLInputElement>(null);


  const uploadFile = async (file: File) => {
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/gallery/upload', { method: 'POST', body: fd });
    const d = await res.json() as { url?: string; error?: string };
    if (d.url) { setImageUrl(d.url); setPreview(d.url); }
    else setError(d.error || '업로드 실패');
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) uploadFile(file);
  };

  const save = async () => {
    setSaving(true); setError('');
    const payload = {
      category, title: title.trim(), memo: memo.trim(),
      image_url: imageUrl || null,
      notion_page_url: notionUrl.trim(),
      notion_page_id: notionUrl.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    const url = item ? `/api/gallery/${item.id}` : '/api/gallery';
    const method = item ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { onSave(); onClose(); }
    else { const d = await res.json() as { error?: string }; setError(d.error || '오류'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-black text-gray-900">{item ? '편집' : '새 사진 추가'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 카테고리 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-2 block">카테고리</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CAT_CONFIG) as Category[]).map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all text-sm font-bold ${
                    category === c ? `${CAT_CONFIG[c].bg} ${CAT_CONFIG[c].border} ${CAT_CONFIG[c].color}` : 'border-gray-100 text-gray-400 hover:border-gray-200'
                  }`}>
                  <span className="text-xl">{CAT_CONFIG[c].icon}</span>
                  {CAT_CONFIG[c].label}
                </button>
              ))}
            </div>
          </div>

          {/* 이미지 업로드 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-2 block">사진</label>
            <div
              className={`relative border-2 border-dashed rounded-2xl transition-all ${preview ? 'border-transparent' : 'border-gray-200 hover:border-indigo-300'}`}
              onDrop={handleDrop} onDragOver={e => e.preventDefault()}
              onClick={() => !preview && fileRef.current?.click()}
              style={{ cursor: preview ? 'default' : 'pointer' }}
            >
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="preview" className="w-full h-52 object-cover rounded-2xl" />
                  <button onClick={e => { e.stopPropagation(); setPreview(''); setImageUrl(''); }}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm transition-colors">✕</button>
                  <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                    className="absolute bottom-2 right-2 text-xs bg-black/50 hover:bg-black/70 text-white px-3 py-1 rounded-full transition-colors">교체</button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-36 text-gray-400">
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">업로드 중...</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl mb-2">🖼️</div>
                      <div className="text-sm font-medium">클릭 또는 드래그로 업로드</div>
                      <div className="text-xs mt-1">JPG, PNG, GIF, WEBP, HEIC</div>
                    </>
                  )}
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} />
            <div className="mt-2">
              <input value={imageUrl} onChange={e => { setImageUrl(e.target.value); setPreview(e.target.value); }}
                placeholder="또는 이미지 URL 직접 입력"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-600 focus:ring-1 focus:ring-indigo-300 focus:outline-none" />
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-2 block">제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="제목 입력"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
          </div>

          {/* 메모 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-2 block">메모</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              rows={3} placeholder="메모를 남겨보세요..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
          </div>


          {/* 태그 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-2 block">태그 (쉼표 구분)</label>
            <input value={tags} onChange={e => setTags(e.target.value)}
              placeholder="예: 여행, 2026, 제주도"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">{error}</p>}
        </div>

        {/* 저장 버튼 */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-semibold hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={save} disabled={saving || uploading}
            className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : item ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 아이템 상세 모달 ──────────────────────────────────────────────────────────
function ItemDetailModal({ item, onEdit, onDelete, onClose }: {
  item: GalleryItem; onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [editMemo, setEditMemo] = useState(item.memo);
  const [savingMemo, setSavingMemo] = useState(false);
  const cat = CAT_CONFIG[item.category];

  const saveMemo = async () => {
    setSavingMemo(true);
    await fetch(`/api/gallery/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo: editMemo }),
    });
    setSavingMemo(false);
  };

  const toggleFav = async () => {
    await fetch(`/api/gallery/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: !item.is_favorite }),
    });
    onClose(); // re-fetch
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 이미지 */}
        {item.image_url && (
          <div className="relative bg-gray-900 flex-shrink-0" style={{ maxHeight: '50vh' }}>
            <img src={item.image_url} alt={item.title} className="w-full object-contain" style={{ maxHeight: '50vh' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            {/* 카테고리 배지 */}
            <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cat.bg} ${cat.color} ${cat.border} border`}>
              {cat.icon} {cat.label}
            </div>
            {/* 즐겨찾기 */}
            <button onClick={toggleFav} className="absolute top-3 right-12 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors text-lg">
              {item.is_favorite ? '⭐' : '☆'}
            </button>
            <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors">✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-xl text-gray-900 leading-tight">{item.title || '제목 없음'}</h2>
              <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleString('ko-KR')}</p>
            </div>
            {!item.image_url && (
              <div className="flex gap-1.5">
                <button onClick={toggleFav} className="text-xl">{item.is_favorite ? '⭐' : '☆'}</button>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">✕</button>
              </div>
            )}
          </div>

          {/* 메모 편집 */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-2 block">📝 메모</label>
            <textarea value={editMemo} onChange={e => setEditMemo(e.target.value)}
              rows={4} placeholder="메모를 남겨보세요..."
              className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm resize-none focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
            {editMemo !== item.memo && (
              <button onClick={saveMemo} disabled={savingMemo}
                className="mt-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-colors">
                {savingMemo ? '저장 중...' : '메모 저장'}
              </button>
            )}
          </div>

          {/* 태그 */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t, i) => (
                <span key={i} className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full">#{t}</span>
              ))}
            </div>
          )}

          {/* Notion 링크 */}
          {item.notion_page_url && (
            <a href={item.notion_page_url} target="_blank" rel="noopener"
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors">
              <span className="text-lg">📔</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-gray-700">Notion 페이지 연결됨</div>
                <div className="text-[10px] text-gray-400 truncate">{item.notion_page_url}</div>
              </div>
              <span className="text-gray-400 text-xs">→</span>
            </a>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onDelete} className="px-4 py-2.5 rounded-2xl border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold transition-colors">삭제</button>
          <button onClick={onEdit} className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors">편집</button>
        </div>
      </div>
    </div>
  );
}

// ── 갤러리 카드 ───────────────────────────────────────────────────────────────
function GalleryCard({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  const cat = CAT_CONFIG[item.category];
  return (
    <div onClick={onClick}
      className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-indigo-200 hover:shadow-xl transition-all duration-300 cursor-pointer"
      style={{ transform: 'translateZ(0)' }}>
      {/* 이미지 */}
      <div className="relative overflow-hidden bg-gray-100" style={{ paddingBottom: '75%' }}>
        {item.image_url ? (
          <img src={item.image_url} alt={item.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="text-5xl opacity-30">{cat.icon}</div>
          </div>
        )}
        {/* 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {/* 즐겨찾기 */}
        {item.is_favorite && (
          <div className="absolute top-2 right-2 text-lg drop-shadow-lg">⭐</div>
        )}
        {/* Notion 배지 */}
        {item.notion_page_url && (
          <div className="absolute top-2 left-2 w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center text-sm shadow-sm">📔</div>
        )}
        {/* 태그 미리보기 (hover) */}
        {item.tags.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 bg-white/80 text-gray-700 rounded-full backdrop-blur-sm">#{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* 하단 정보 */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-gray-900 truncate">{item.title || '제목 없음'}</h3>
            {item.memo && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{item.memo}</p>}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
            {cat.icon} {cat.label}
          </span>
          <span className="text-[10px] text-gray-300">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
      </div>
    </div>
  );
}

// ── 갤러리 설정 모달 ──────────────────────────────────────────────────────────
function GallerySettingsModal({ onClose }: { onClose: () => void }) {
  const [notionDbUrl, setNotionDbUrl] = useState('');
  const [secretPw, setSecretPw] = useState('');
  const [notionSet, setNotionSet] = useState(false);
  const [pwSet, setPwSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/app-settings')
      .then(r => r.ok ? r.json() : {})
      .then((d: { hasKey?: Record<string, boolean>; settings?: Record<string, string> }) => {
        setNotionSet(!!d.hasKey?.['GALLERY_NOTION_DB_URL']);
        setPwSet(!!d.hasKey?.['GALLERY_SECRET_PASSWORD']);
        if (d.settings?.['GALLERY_NOTION_DB_URL']) setNotionDbUrl(d.settings['GALLERY_NOTION_DB_URL']);
      });
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    const body: Record<string, string> = {};
    if (notionDbUrl.trim()) body['GALLERY_NOTION_DB_URL'] = notionDbUrl.trim();
    if (secretPw.trim()) body['GALLERY_SECRET_PASSWORD'] = secretPw.trim();
    if (Object.keys(body).length === 0) { setSaving(false); return; }
    const res = await fetch('/api/app-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMsg('✅ 저장됨');
      if (notionDbUrl.trim()) setNotionSet(true);
      if (secretPw.trim()) { setPwSet(true); setSecretPw(''); }
      setTimeout(() => setMsg(''), 2000);
    } else {
      setMsg('❌ 저장 실패');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-black text-gray-900">⚙️ 갤러리 설정</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">✕</button>
        </div>
        <div className="p-6 space-y-5">
          {/* Notion DB 연결 */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block flex items-center gap-1.5">
              📔 Notion DB 연결
              {notionSet && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">연결됨</span>}
            </label>
            <input
              value={notionDbUrl}
              onChange={e => setNotionDbUrl(e.target.value)}
              placeholder="Notion 페이지 또는 DB URL (https://notion.so/...)"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">한 번만 입력하면 갤러리 전체에서 계속 사용됩니다</p>
          </div>

          {/* 비밀 갤러리 비밀번호 */}
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1.5 block flex items-center gap-1.5">
              🔒 비밀 갤러리 비밀번호
              {pwSet && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">설정됨</span>}
            </label>
            <input
              type="password"
              value={secretPw}
              onChange={e => setSecretPw(e.target.value)}
              placeholder={pwSet ? '새 비밀번호를 입력하면 교체됩니다' : '비밀번호 입력'}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-300 focus:outline-none"
              autoComplete="new-password"
            />
          </div>

          {msg && <p className={`text-sm font-medium text-center ${msg.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>{msg}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-semibold hover:bg-gray-50 transition-colors">닫기</button>
            <button onClick={save} disabled={saving || (!notionDbUrl.trim() && !secretPw.trim())}
              className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50 transition-colors">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function GalleryPage() {
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editItem, setEditItem] = useState<GalleryItem | null>(null);
  const [detailItem, setDetailItem] = useState<GalleryItem | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'masonry'>('grid');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'favorite'>('newest');
  const [notionConnected, setNotionConnected] = useState(false);

  useEffect(() => {
    fetch('/api/app-settings')
      .then(r => r.ok ? r.json() : {})
      .then((d: { hasKey?: Record<string, boolean> }) => {
        setNotionConnected(!!d.hasKey?.['GALLERY_NOTION_DB_URL']);
      });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const cat = activeCategory === 'all' ? '' : activeCategory;
    const res = await fetch(`/api/gallery${cat ? `?category=${cat}` : ''}`);
    if (res.ok) setItems(await res.json() as GalleryItem[]);
    setLoading(false);
  }, [activeCategory]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCategoryClick = (cat: Category | 'all') => {
    if (cat === 'secret' && !secretUnlocked) { setShowSecretModal(true); return; }
    setActiveCategory(cat);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/gallery/${id}`, { method: 'DELETE' });
    setDetailItem(null); loadItems();
  };

  // 필터링 + 정렬
  const filtered = items
    .filter(item => {
      if (!search) return true;
      const q = search.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.memo.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'favorite') return (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0);
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const counts = {
    all: items.length,
    personal: items.filter(i => i.category === 'personal').length,
    work: items.filter(i => i.category === 'work').length,
    secret: items.filter(i => i.category === 'secret').length,
  };

  return (
    <div className="min-h-full bg-gray-50">
      {/* 모달들 */}
      {showSecretModal && (
        <SecretUnlockModal
          onSuccess={() => { setSecretUnlocked(true); setShowSecretModal(false); setActiveCategory('secret'); }}
          onClose={() => setShowSecretModal(false)}
        />
      )}
      {(showAddModal || editItem) && (
        <ItemModal
          item={editItem}
          defaultCategory={activeCategory === 'all' ? 'personal' : activeCategory}
          onSave={loadItems}
          onClose={() => { setShowAddModal(false); setEditItem(null); }}
        />
      )}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          onEdit={() => { setEditItem(detailItem); setDetailItem(null); }}
          onDelete={() => handleDelete(detailItem.id)}
          onClose={() => { setDetailItem(null); loadItems(); }}
        />
      )}
      {showSettings && (
        <GallerySettingsModal onClose={() => {
          setShowSettings(false);
          fetch('/api/app-settings').then(r => r.ok ? r.json() : {}).then((d: { hasKey?: Record<string, boolean> }) => {
            setNotionConnected(!!d.hasKey?.['GALLERY_NOTION_DB_URL']);
          });
        }} />
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>🖼️</span>
              사진 갤러리
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">개인·업무·비밀 갤러리 · 메모</p>
              {notionConnected && (
                <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-semibold">📔 Notion 연결됨</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 설정 */}
            <button onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              title="갤러리 설정">
              ⚙️
            </button>
            {/* 뷰 모드 */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {(['grid','masonry'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
                  {m === 'grid' ? '⊞ 격자' : '⊟ 폭포'}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
              <span className="text-base">+</span> 추가
            </button>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <button onClick={() => setActiveCategory('all')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
              activeCategory === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            🖼️ 전체 <span className="text-xs opacity-70">({counts.all})</span>
          </button>
          {(Object.keys(CAT_CONFIG) as Category[]).map(cat => (
            <button key={cat} onClick={() => handleCategoryClick(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                activeCategory === cat
                  ? `${CAT_CONFIG[cat].bg} ${CAT_CONFIG[cat].color} ${CAT_CONFIG[cat].border} border-2`
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {CAT_CONFIG[cat].icon} {CAT_CONFIG[cat].label}
              <span className="text-xs opacity-70">({counts[cat]})</span>
              {cat === 'secret' && !secretUnlocked && <span className="text-xs">🔒</span>}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        {/* 검색 + 정렬 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="제목, 메모, 태그 검색..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 focus:ring-2 focus:ring-indigo-300 focus:outline-none">
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="favorite">즐겨찾기</option>
          </select>
          {search && (
            <span className="text-xs text-gray-400">{filtered.length}개 결과</span>
          )}
        </div>

        {/* 로딩 */}
        {loading && (
          <div className={`grid gap-4 ${viewMode === 'masonry' ? 'columns-2 md:columns-3 lg:columns-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
                <div className="bg-gray-100" style={{ paddingBottom: '75%' }} />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 갤러리 그리드 */}
        {!loading && filtered.length > 0 && (
          viewMode === 'masonry' ? (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
              {filtered.map(item => (
                <div key={item.id} className="break-inside-avoid">
                  <GalleryCard item={item} onClick={() => setDetailItem(item)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map(item => (
                <GalleryCard key={item.id} item={item} onClick={() => setDetailItem(item)} />
              ))}
            </div>
          )
        )}

        {/* 빈 상태 */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4"
              style={{background:'linear-gradient(135deg,#EEF2FF,#F5F3FF)'}}>
              {activeCategory === 'all' ? '🖼️' : CAT_CONFIG[activeCategory as Category]?.icon || '🖼️'}
            </div>
            <h3 className="font-black text-gray-700 text-lg mb-2">
              {search ? `"${search}" 검색 결과 없음` : '사진이 없습니다'}
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              {search ? '다른 키워드로 검색해보세요' : activeCategory === 'secret' ? '비밀 갤러리에 사진을 추가해보세요' : '첫 번째 사진을 추가해보세요'}
            </p>
            {!search && (
              <button onClick={() => setShowAddModal(true)}
                className="px-6 py-3 rounded-2xl text-white font-bold text-sm transition-all hover:opacity-90"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                + 사진 추가하기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
