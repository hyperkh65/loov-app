'use client';

import { useState, useEffect } from 'react';
import { dbGetPhotos, dbUpdatePhoto, type StoredPhoto } from '@/lib/camera-db';

export default function GalleryPage() {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(null);

  const isValidUrl = (url: string) =>
    url && (url.startsWith('http://') || url.startsWith('https://') ||
      (url.startsWith('data:image/') && url.length > 1000));

  const loadPhotos = async () => {
    setSyncing(true);
    // 로컬 IndexedDB (is_secret=false)
    const local = (await dbGetPhotos()).filter(p => !p.isSecret);
    setPhotos(local);
    // Supabase 클라우드 동기화
    try {
      const res = await fetch('/api/camera/save');
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
              isSecret: false,
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

  useEffect(() => { loadPhotos(); }, []);

  // 특수사진첩으로 이동 (toggle ON)
  const moveToSecret = async (photo: StoredPhoto) => {
    setToggling(photo.id);
    try {
      await dbUpdatePhoto(photo.id, { isSecret: true });
      // Supabase 업데이트 (비밀번호 포함)
      await fetch('/api/camera/save', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photo.id, isSecret: true, password: '0506' }),
      });
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
    } catch {}
    setToggling(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">사진 로드 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            🖼️ 일반사진첩
          </h1>
          <p className="text-sm text-slate-400 mt-1">사진 {photos.length}장 · 🔒 토글 ON → 특수사진첩으로 이동</p>
        </div>
        <button
          onClick={loadPhotos}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors disabled:opacity-50"
        >
          <span className={syncing ? 'animate-spin' : ''}>↻</span>
          {syncing ? '동기화 중...' : '동기화'}
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-4">
          <span className="text-6xl">🖼️</span>
          <p className="text-lg font-medium">사진이 없습니다</p>
          <p className="text-sm">스마트 카메라로 사진을 찍어보세요</p>
          <a href="/dashboard/camera" className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors">
            📷 카메라 열기
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-2xl overflow-hidden bg-slate-800 aspect-square">
              {/* 사진 */}
              <img
                src={photo.processedUrl || photo.dataUrl} alt=""
                className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                style={{ filter: photo.processedUrl ? 'none' : (photo.filterCss || 'none') }}
                onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                onClick={() => setSelectedPhoto(photo)}
              />

              {/* 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* 정보 */}
              <div className="absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <p className="text-white text-[10px] truncate">{photo.timestamp}</p>
              </div>

              {/* 업로드 뱃지 */}
              {photo.uploaded && (
                <span className="absolute top-2 left-2 w-5 h-5 bg-green-500/90 rounded-full text-white text-[9px] flex items-center justify-center">✓</span>
              )}

              {/* 특수사진첩으로 이동 토글 */}
              <button
                onClick={() => moveToSecret(photo)}
                disabled={toggling === photo.id}
                className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 hover:bg-black/80 text-white text-[10px] px-2 py-1 rounded-full transition-all disabled:opacity-50 backdrop-blur-sm"
                title="특수사진첩으로 이동"
              >
                {toggling === photo.id
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <>🔒 <span className="hidden sm:inline">특수로</span></>
                }
              </button>
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
                onClick={() => moveToSecret(selectedPhoto)}
                disabled={toggling === selectedPhoto.id}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                🔒 특수사진첩으로 이동
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
