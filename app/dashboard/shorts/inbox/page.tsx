'use client';

import { useEffect, useState } from 'react';

interface Row { id: string; platform_post_id: string; posted_at: string; meta: { title?: string; scheduled?: string | null } }

export default function ShortsInboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch('/api/shorts-inbox/list').then(r => r.json()).then(d => setRows(Array.isArray(d) ? d : []));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-1">딸깍 쇼츠 업로드 내역</h1>
      <p className="text-sm text-gray-500 mb-6">맥 앱 &quot;숏폼 딸깍&quot;에서 LOOV로 보낸 쇼츠가 여기에 쌓입니다.</p>
      {rows === null ? <p className="text-gray-400">불러오는 중…</p> : rows.length === 0 ? <p className="text-gray-400">아직 업로드한 쇼츠가 없어요.</p> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {rows.map(r => (
            <a key={r.id} href={`https://youtube.com/shorts/${r.platform_post_id}`} target="_blank" rel="noreferrer" className="block rounded-xl border overflow-hidden hover:shadow-md transition">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${r.platform_post_id}/hqdefault.jpg`} alt="" className="w-full aspect-[9/16] object-cover bg-gray-100" />
              <div className="p-2 text-sm">
                <div className="font-medium line-clamp-2">{r.meta.title || r.platform_post_id}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {r.meta.scheduled ? `예약 공개 ${new Date(r.meta.scheduled).toLocaleString('ko-KR')}` : new Date(r.posted_at).toLocaleString('ko-KR')}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
