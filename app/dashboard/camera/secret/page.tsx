'use client';

import { useState } from 'react';
import { dbGetPhotos, dbUpdatePhoto, type StoredPhoto } from '@/lib/camera-db';

const SECRET_PW = process.env.NEXT_PUBLIC_CAMERA_SECRET_PASSWORD;

export default function SecretGalleryPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(null);
  const [sessionPw, setSessionPw] = useState('');

  const isValidUrl = (url: string) =>
    url && (url.startsWith('http://') || url.startsWith('https://') ||
      (url.startsWith('data:image/') && url.length > 1000));

  const verify = async () => {
    setPwLoading(true);
    setPwError('');
    try {
      const res = await fetch('/api/camera/secret-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        setSessionPw(pw);
        setAuthed(true);
        setPw('');
        await loadPhotos(pw);
      } else {
        setPwError('비밀번호가 틀렸습니다');
      }
    } catch { setPwError('오류가 발생했습니다'); }
    setPwLoading(false);
  };

  const loadPhotos = async (password: string) => {
    setSyncing(true);
    setLoading(true);
    // 로컬 IndexedDB (isSecret=true)
    const local = (await dbGetPhotos()).filter(p => p.isSecret);
    setPhotos(local);
    // Supabase 클라우드
    try {
      const res = await fetch('/api/camera/save?secret=1', {
        headers: { 'x-secret-password': password },
      });
      if (res.ok) {
        const { photos: cloud } = await res.json();
        if (cloud?.length) {
          const cloudMapped: StoredPhoto[] = cloud
            .filter((r: any) => isValidUrl(r.cloudinary_url))
            .map((r: any) => ({
              id: r.id,
              dataUrl: r.cloudinary_url,
              filter: r.filter || 'normal',
              filterCss: r.filter_css || '',
              timestamp: r.timestamp || r.created_at,
              lat: r.lat, lng: r.lng,
              uploaded: true,
              cloudinaryUrl: r.thumbnail_url || r.cloudinary_url,
              isSecret: true,
            }));
          const cloudIds = new Set(cloudMapped.map(p => p.id));
          const localOnly = local.filter(p => !p.uploaded && !cloudIds.has(p.id));
          setPhotos([...localOnly, ...cloudMapped]);
        }
      }
    } catch {}
    setSyncing(false);
    setLoading(false);
  };

  // 일반사진첩으로 이동 (toggle OFF)
  const moveToNormal = async (photo: StoredPhoto) => {
    setToggling(photo.id);
    try {
      await dbUpdatePhoto(photo.id, { isSecret: false });
      await fetch('/api/camera/save', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photo.id, isSecret: false, password: sessionPw }),
      });
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
    } catch {}
    setToggling(null);
  };

  // 비밀번호 입력 화면
  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-[500px] p-6">
        <div className="w-full max-w-sm">
          <div className="bg-slate-800/60 rounded-3xl p-8 space-y-6 border border-slate-700/50 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-5xl mb-3">🔒</div>
              <h2 className="text-xl font-bold text-white">특수사진첩</h2>
              <p className="text-sm text-slate-400 mt-1">비밀번호를 입력하세요</p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && verify()}
              placeholder="••••"
              autoFocus
              className="w-full bg-slate-700/60 border border-slate-600 rounded-2xl px-5 py-4 text-white text-3xl text-center tracking-[1.5rem] placeholder:tracking-normal placeholder:text-2xl focus:outline-none focus:border-purple-500 transition-colors"
            />
            {pwError && (
              <p className="text-red-400 text-sm text-center">{pwError}</p>
            )}
            <button
              onClick={verify}
              disabled={pwLoading || !pw}
              className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-base transition-colors disabled:opacity-40"
            >
              {pwLoading ? '확인 중...' : '입장'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 인증 후 사진첩
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            🔒 특수사진첩
          </h1>
          <p className="text-sm text-slate-400 mt-1">사진 {photos.length}장 · 🔓 토글 OFF → 일반사진첩으로 이동</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadPhotos(sessionPw)}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors disabled:opacity-50"
          >
            <span className={syncing ? 'animate-spin' : ''}>↻</span>
            {syncing ? '동기화 중...' : '동기화'}
          </button>
          <button
            onClick={() => { setAuthed(false); setPhotos([]); setSessionPw(''); }}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
          >
            🔒 잠금
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
          <span className="text-6xl">🔒</span>
          <p className="text-lg font-medium">특수사진이 없습니다</p>
          <p className="text-sm">일반사진첩에서 🔒 버튼으로 이동할 수 있습니다</p>
          <a href="/dashboard/camera/gallery" className="mt-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 transition-colors">
            🖼️ 일반사진첩 가기
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-2xl overflow-hidden bg-slate-800 aspect-square">
              <img
                src={photo.processedUrl || photo.dataUrl} alt=""
                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                style={{ filter: photo.processedUrl ? 'none' : (photo.filterCss || 'none') }}
                onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                onClick={() => setSelectedPhoto(photo)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* 일반사진첩으로 이동 토글 */}
              <button
                onClick={() => moveToNormal(photo)}
                disabled={toggling === photo.id}
                className="absolute top-2 right-2 flex items-center gap-1 bg-purple-600/80 hover:bg-purple-500 text-white text-[10px] px-2 py-1 rounded-full transition-all disabled:opacity-50 backdrop-blur-sm"
                title="일반사진첩으로 이동"
              >
                {toggling === photo.id
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <>🔓 <span className="hidden sm:inline">일반으로</span></>
                }
              </button>

              <div className="absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <p className="text-white text-[10px] truncate">{photo.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 사진 상세 모달 */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={selectedPhoto.processedUrl || selectedPhoto.dataUrl} alt=""
              className="w-full max-h-[70vh] object-contain rounded-2xl"
              style={{ filter: selectedPhoto.processedUrl ? 'none' : (selectedPhoto.filterCss || 'none') }}
            />
            <div className="mt-3 flex items-center justify-between px-1">
              <div>
                <p className="text-white text-sm">{selectedPhoto.timestamp}</p>
                {selectedPhoto.lat && (
                  <p className="text-slate-400 text-xs mt-0.5">📍 {selectedPhoto.lat.toFixed(4)}, {selectedPhoto.lng?.toFixed(4)}</p>
                )}
              </div>
              <button
                onClick={() => moveToNormal(selectedPhoto)}
                disabled={toggling === selectedPhoto.id}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                🔓 일반사진첩으로 이동
              </button>
            </div>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-full text-white flex items-center justify-center text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
