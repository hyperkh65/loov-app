'use client';

import { useState, useEffect, useCallback } from 'react';

interface TistoryBlog {
  id: string;
  blog_name: string;
  blog_url: string;
  display_name: string;
  is_active: boolean;
  last_tested_at: string | null;
  created_at: string;
}

export default function TistoryPage() {
  const [blogs, setBlogs] = useState<TistoryBlog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const [formBlogName, setFormBlogName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formTssession, setFormTssession] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editTssession, setEditTssession] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/tistory/connections');
    if (res.ok) setBlogs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const handleAdd = async () => {
    if (!formBlogName || !formTssession) return flash('블로그명과 TSSESSION을 입력하세요');
    setSaving(true);
    const res = await fetch('/api/tistory/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blog_name: formBlogName.trim(),
        display_name: formDisplayName.trim() || formBlogName.trim(),
        tssession: formTssession.trim(),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setFormBlogName(''); setFormDisplayName(''); setFormTssession('');
      flash('✅ 블로그 추가됨');
      load();
    } else {
      const d = await res.json();
      flash('❌ ' + d.error);
    }
  };

  const handleUpdateCookie = async (id: string) => {
    if (!editTssession) return flash('TSSESSION을 입력하세요');
    setSaving(true);
    const res = await fetch('/api/tistory/connections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tssession: editTssession }),
    });
    setSaving(false);
    if (res.ok) { setEditId(null); setEditTssession(''); flash('✅ 쿠키 갱신됨'); load(); }
    else { const d = await res.json(); flash('❌ ' + d.error); }
  };

  const handleToggle = async (blog: TistoryBlog) => {
    await fetch('/api/tistory/connections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: blog.id, is_active: !blog.is_active }),
    });
    load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 연결을 삭제하시겠습니까?`)) return;
    await fetch('/api/tistory/connections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    flash('🗑️ 삭제됨');
    load();
  };

  const handleTest = async (blog: TistoryBlog) => {
    setTestingId(blog.id);
    try {
      const res = await fetch('/api/tistory/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_id: blog.id }),
      });
      const data = await res.json();
      if (data.ok) {
        flash(`✅ ${blog.display_name} — TSSESSION 유효 (관리 페이지 접근 성공)`);
      } else {
        flash(`❌ ${blog.display_name} — ${data.reason || '연결 실패'}`);
      }
    } catch (e) {
      flash('❌ 테스트 오류: ' + String(e));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">티스토리 블로그 관리</h1>

      {msg && (
        <div className={`p-3 rounded text-sm ${msg.startsWith('✅') ? 'bg-green-50 text-green-800' : msg.startsWith('❌') ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
          {msg}
        </div>
      )}

      {/* TSSESSION 안내 */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm space-y-1">
        <p className="font-semibold text-amber-800">TSSESSION 쿠키 발급 방법</p>
        <ol className="list-decimal list-inside text-amber-700 space-y-1">
          <li>tistory.com에서 카카오 로그인</li>
          <li>F12 → Application → Cookies → www.tistory.com</li>
          <li><code className="bg-amber-100 px-1 rounded">TSSESSION</code> 값 복사</li>
        </ol>
        <p className="text-amber-600 text-xs mt-1">※ 추가 후 반드시 <strong>연결 테스트</strong> 버튼으로 쿠키 유효성을 확인하세요.</p>
      </div>

      {/* Supabase 테이블 안내 */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded text-sm">
        <p className="font-semibold text-gray-700 mb-2">Supabase 테이블 설정 (최초 1회)</p>
        <pre className="text-xs bg-white border rounded p-3 overflow-x-auto text-gray-600">{`-- Supabase SQL Editor에서 실행
CREATE TABLE IF NOT EXISTS tistory_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  blog_name text NOT NULL,
  blog_url text NOT NULL,
  display_name text,
  tssession text NOT NULL,
  is_active boolean DEFAULT true,
  last_tested_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, blog_name)
);

CREATE TABLE IF NOT EXISTS tistory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  blog_id uuid REFERENCES tistory_connections,
  blog_name text,
  post_id text,
  post_url text,
  title text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bossai_auto_settings
  ADD COLUMN IF NOT EXISTS tistory_auto_publish boolean DEFAULT false;`}</pre>
      </div>

      {/* 블로그 추가 */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-gray-700">블로그 추가</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">블로그명 (서브도메인)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="예: myblog (myblog.tistory.com)"
              value={formBlogName}
              onChange={e => setFormBlogName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">표시 이름 (선택)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="예: 내 티스토리"
              value={formDisplayName}
              onChange={e => setFormDisplayName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">TSSESSION 쿠키값</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm font-mono"
            placeholder="bc0d6ec6b82a4124ff3e964f286bb35..."
            value={formTssession}
            onChange={e => setFormTssession(e.target.value)}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium text-sm disabled:opacity-50"
        >
          {saving ? '추가 중...' : '+ 블로그 추가'}
        </button>
      </div>

      {/* 블로그 목록 */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-700">연결된 블로그 ({blogs.length}개)</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">로딩 중...</p>
        ) : blogs.length === 0 ? (
          <p className="text-gray-400 text-sm">연결된 블로그가 없습니다</p>
        ) : (
          blogs.map(blog => (
            <div key={blog.id} className={`border rounded-lg p-4 space-y-3 ${!blog.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{blog.display_name}</p>
                  <a href={blog.blog_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline">{blog.blog_url}</a>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => handleTest(blog)}
                    disabled={testingId === blog.id}
                    className="text-xs px-3 py-1 rounded border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                  >
                    {testingId === blog.id ? '테스트 중...' : '연결 테스트'}
                  </button>
                  <button
                    onClick={() => handleToggle(blog)}
                    className={`text-xs px-3 py-1 rounded border ${blog.is_active ? 'border-green-400 text-green-600' : 'border-gray-300 text-gray-400'}`}
                  >
                    {blog.is_active ? '활성' : '비활성'}
                  </button>
                  <button
                    onClick={() => { setEditId(blog.id); setEditTssession(''); }}
                    className="text-xs px-3 py-1 rounded border border-blue-300 text-blue-600"
                  >
                    쿠키 갱신
                  </button>
                  <button
                    onClick={() => handleDelete(blog.id, blog.display_name)}
                    className="text-xs px-3 py-1 rounded border border-red-300 text-red-500"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {blog.last_tested_at && (
                <p className="text-xs text-gray-400">
                  마지막 발행: {new Date(blog.last_tested_at).toLocaleString('ko-KR')}
                </p>
              )}

              {editId === blog.id && (
                <div className="flex gap-2 pt-1">
                  <input
                    className="flex-1 border rounded px-3 py-1.5 text-sm font-mono"
                    placeholder="새 TSSESSION 값 입력"
                    value={editTssession}
                    onChange={e => setEditTssession(e.target.value)}
                  />
                  <button
                    onClick={() => handleUpdateCookie(blog.id)}
                    disabled={saving}
                    className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="px-3 py-1.5 border rounded text-sm"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
