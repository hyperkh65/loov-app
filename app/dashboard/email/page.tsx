'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface EmailAccount {
  id: string;
  name: string;
  email: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  is_active: boolean;
}

interface EmailItem {
  uid: number;
  seq: number;
  subject: string;
  from: { name?: string; address?: string } | null;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachment: boolean;
}

interface EmailDetail {
  uid: number;
  subject: string;
  from: Array<{ name?: string; address?: string }>;
  to: Array<{ name?: string; address?: string }>;
  cc: Array<{ name?: string; address?: string }>;
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: Array<{ filename: string; contentType: string; size: number; content: string }>;
}

interface ComposeData {
  to: string;
  cc: string;
  subject: string;
  html: string;
  replyToMsgId?: number;
}

interface FolderItem {
  path: string;
  name: string;
  specialUse?: string;
}

// ── 프리셋 ────────────────────────────────────────────────────────────────────
const PRESETS: Record<string, { imap_host: string; imap_port: number; imap_secure: boolean; smtp_host: string; smtp_port: number; smtp_secure: boolean }> = {
  gmail:   { imap_host: 'imap.gmail.com',   imap_port: 993, imap_secure: true,  smtp_host: 'smtp.gmail.com',   smtp_port: 587, smtp_secure: false },
  naver:   { imap_host: 'imap.naver.com',   imap_port: 993, imap_secure: true,  smtp_host: 'smtp.naver.com',   smtp_port: 587, smtp_secure: false },
  daum:    { imap_host: 'imap.daum.net',    imap_port: 993, imap_secure: true,  smtp_host: 'smtp.daum.net',    smtp_port: 465, smtp_secure: true  },
  outlook: { imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false },
  yahoo:   { imap_host: 'imap.mail.yahoo.com',   imap_port: 993, imap_secure: true, smtp_host: 'smtp.mail.yahoo.com',  smtp_port: 587, smtp_secure: false },
};

function fmtDate(d: string | null) {
  if (!d) return '';
  const dt = new Date(d);
  const now = new Date();
  const diff = now.getTime() - dt.getTime();
  if (diff < 86400000 && dt.getDate() === now.getDate()) {
    return dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * 86400000) {
    return dt.toLocaleDateString('ko-KR', { weekday: 'short' });
  }
  return dt.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function fmtFrom(from: { name?: string; address?: string } | null) {
  if (!from) return '(발신자 없음)';
  return from.name || from.address || '(발신자 없음)';
}

function folderLabel(f: FolderItem) {
  const su = f.specialUse?.toLowerCase() ?? '';
  if (su.includes('inbox') || f.path.toLowerCase() === 'inbox') return { icon: '📥', label: '받은편지함' };
  if (su.includes('sent'))    return { icon: '📤', label: '보낸편지함' };
  if (su.includes('drafts'))  return { icon: '📝', label: '임시보관함' };
  if (su.includes('trash'))   return { icon: '🗑️', label: '휴지통' };
  if (su.includes('junk') || su.includes('spam')) return { icon: '🚫', label: '스팸' };
  if (su.includes('archive')) return { icon: '📦', label: '보관함' };
  return { icon: '📁', label: f.name };
}

// ── 계정 추가 모달 ─────────────────────────────────────────────────────────────
function AddAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: (a: EmailAccount) => void }) {
  const [form, setForm] = useState({
    name: '', email: '',
    imap_host: '', imap_port: 993, imap_secure: true, imap_user: '', imap_password: '',
    smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_password: '',
  });
  const [step, setStep] = useState<'preset' | 'form'>('preset');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    setForm(f => ({ ...f, ...p }));
    setStep('form');
  };

  const syncUser = (email: string) => {
    setForm(f => ({
      ...f, email,
      imap_user: f.imap_user || email,
      smtp_user: f.smtp_user || email,
    }));
  };

  const test = async () => {
    setTesting(true); setError('');
    const res = await fetch('/api/email/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, testOnly: true }),
    });
    const d = await res.json();
    setTesting(false);
    if (!res.ok) setError(d.error);
    else setError('✅ 연결 성공!');
  };

  const save = async () => {
    setSaving(true); setError('');
    const res = await fetch('/api/email/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error); return; }
    onAdded(d);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">이메일 계정 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {step === 'preset' ? (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-500 mb-4">이메일 제공사를 선택하세요</p>
            {[
              { key: 'gmail',   icon: '📧', name: 'Gmail', hint: '앱 비밀번호 필요' },
              { key: 'naver',   icon: '🟢', name: '네이버 메일', hint: 'IMAP 설정 활성화 필요' },
              { key: 'daum',    icon: '🔵', name: '다음 메일', hint: '' },
              { key: 'outlook', icon: '🔷', name: 'Outlook / Microsoft 365', hint: '' },
              { key: 'yahoo',   icon: '🟣', name: 'Yahoo Mail', hint: '앱 비밀번호 필요' },
            ].map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className="w-full flex items-center gap-3 p-3.5 border rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left">
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  {p.hint && <div className="text-xs text-orange-500">{p.hint}</div>}
                </div>
              </button>
            ))}
            <button onClick={() => setStep('form')}
              className="w-full p-3 border-dashed border-2 rounded-xl text-sm text-gray-500 hover:border-gray-400 transition">
              ⚙️ 직접 입력
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">표시 이름</label>
                <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="홍길동" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">이메일 주소</label>
                <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.email} onChange={e => syncUser(e.target.value)} placeholder="you@example.com" />
              </div>
            </div>

            <div className="border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500">IMAP (받기)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} placeholder="imap.example.com" />
                </div>
                <input className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  type="number" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: +e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.imap_user} onChange={e => setForm(f => ({ ...f, imap_user: e.target.value }))} placeholder="사용자명" />
                <input className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  type="password" value={form.imap_password} onChange={e => setForm(f => ({ ...f, imap_password: e.target.value }))} placeholder="비밀번호/앱키" />
              </div>
            </div>

            <div className="border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500">SMTP (보내기)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <input className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.example.com" />
                </div>
                <input className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: +e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.smtp_user} onChange={e => setForm(f => ({ ...f, smtp_user: e.target.value }))} placeholder="사용자명" />
                <input className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  type="password" value={form.smtp_password} onChange={e => setForm(f => ({ ...f, smtp_password: e.target.value }))} placeholder="비밀번호/앱키" />
              </div>
            </div>

            {error && (
              <p className={`text-sm ${error.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep('preset')} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">← 뒤로</button>
              <button onClick={test} disabled={testing}
                className="px-4 py-2 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                {testing ? '테스트 중...' : '연결 테스트'}
              </button>
              <button onClick={save} disabled={saving || !form.name || !form.email || !form.imap_host || !form.smtp_host}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : '계정 추가'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 메일 작성 모달 ─────────────────────────────────────────────────────────────
function ComposeModal({ accountId, initial, onClose, onSent }: {
  accountId: string; initial?: Partial<ComposeData>; onClose: () => void; onSent: () => void;
}) {
  const [form, setForm] = useState<ComposeData>({
    to: initial?.to ?? '',
    cc: initial?.cc ?? '',
    subject: initial?.subject ?? '',
    html: initial?.html ?? '',
  });
  const [showCc, setShowCc] = useState(!!initial?.cc);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<Array<{ filename: string; contentType: string; content: string; size: number }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const base64 = (ev.target?.result as string).split(',')[1];
        setAttachments(prev => [...prev, { filename: file.name, contentType: file.type, content: base64, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const send = async () => {
    if (!form.to.trim()) { setError('받는 사람을 입력하세요'); return; }
    if (!form.subject.trim()) { setError('제목을 입력하세요'); return; }
    setSending(true); setError('');
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, ...form, attachments }),
    });
    const d = await res.json();
    setSending(false);
    if (!res.ok) { setError(d.error); return; }
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl sm:rounded-t-2xl">
          <h3 className="font-semibold text-sm">새 메일 작성</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="border-b px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-500 w-12">받는 사람</span>
            <input className="flex-1 text-sm focus:outline-none"
              value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
              placeholder="이메일 주소 (쉼표로 구분)" />
            <button onClick={() => setShowCc(!showCc)} className="text-xs text-blue-500">CC</button>
          </div>
          {showCc && (
            <div className="border-b px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-gray-500 w-12">참조</span>
              <input className="flex-1 text-sm focus:outline-none"
                value={form.cc} onChange={e => setForm(f => ({ ...f, cc: e.target.value }))}
                placeholder="CC 주소" />
            </div>
          )}
          <div className="border-b px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-500 w-12">제목</span>
            <input className="flex-1 text-sm focus:outline-none font-medium"
              value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="제목 입력" />
          </div>

          <textarea className="flex-1 px-4 py-3 text-sm resize-none focus:outline-none min-h-[200px]"
            value={form.html} onChange={e => setForm(f => ({ ...f, html: e.target.value }))}
            placeholder="메일 내용을 입력하세요..." />

          {attachments.length > 0 && (
            <div className="px-4 py-2 border-t flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1 text-xs">
                  <span>📎 {a.filename}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 ml-1">✕</button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="px-4 py-2 text-sm text-red-500 border-t">{error}</p>}

          <div className="flex items-center gap-2 px-4 py-3 border-t">
            <button onClick={send} disabled={sending}
              className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
              {sending ? '전송 중...' : '📤 보내기'}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={addFile} />
            <button onClick={() => fileRef.current?.click()}
              className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 text-gray-600">
              📎 첨부
            </button>
            <div className="flex-1" />
            <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">취소</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function EmailPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folder, setFolder] = useState('INBOX');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeInit, setComposeInit] = useState<Partial<ComposeData>>({});
  const [view, setView] = useState<'list' | 'detail'>('list'); // mobile view

  // 계정 목록 로드
  useEffect(() => {
    fetch('/api/email/accounts')
      .then(r => r.json())
      .then((d: EmailAccount[]) => {
        if (Array.isArray(d)) { setAccounts(d); if (d.length > 0) setSelectedAccount(d[0]); }
      })
      .catch(() => {});
  }, []);

  // 폴더 목록 로드
  useEffect(() => {
    if (!selectedAccount) return;
    fetch(`/api/email/folders?accountId=${selectedAccount.id}`)
      .then(r => r.json())
      .then((d: FolderItem[]) => {
        if (Array.isArray(d)) setFolders(d);
      })
      .catch(() => {});
  }, [selectedAccount]);

  // 메일 목록 로드
  const loadEmails = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/email/inbox?accountId=${selectedAccount.id}&folder=${encodeURIComponent(folder)}&page=${page}`);
      const d = await res.json();
      if (d.messages) { setEmails(d.messages); setTotal(d.total); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedAccount, folder, page]);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  // 메일 상세 로드
  const loadDetail = useCallback(async (item: EmailItem) => {
    if (!selectedAccount) return;
    setDetailLoading(true);
    setView('detail');
    try {
      const res = await fetch(`/api/email/message?accountId=${selectedAccount.id}&uid=${item.uid}&folder=${encodeURIComponent(folder)}`);
      const d = await res.json();
      if (!d.error) {
        setDetail(d);
        setEmails(prev => prev.map(e => e.uid === item.uid ? { ...e, seen: true } : e));
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  }, [selectedAccount, folder]);

  const openEmail = (item: EmailItem) => {
    setSelectedEmail(item);
    loadDetail(item);
  };

  const replyTo = () => {
    if (!detail) return;
    const from = detail.from[0];
    setComposeInit({
      to: from?.address ?? '',
      subject: `Re: ${detail.subject}`,
      html: `\n\n---\n${detail.text ?? ''}`,
    });
    setShowCompose(true);
  };

  const forwardEmail = () => {
    if (!detail) return;
    setComposeInit({
      subject: `Fwd: ${detail.subject}`,
      html: `\n\n---\n${detail.text ?? ''}`,
    });
    setShowCompose(true);
  };

  // 주요 폴더 우선 정렬
  const sortedFolders = [...folders].sort((a, b) => {
    const priority = (f: FolderItem) => {
      const p = f.path.toLowerCase();
      if (p === 'inbox') return 0;
      const su = f.specialUse?.toLowerCase() ?? '';
      if (su.includes('sent')) return 1;
      if (su.includes('draft')) return 2;
      if (su.includes('trash')) return 3;
      if (su.includes('junk') || su.includes('spam')) return 4;
      return 5;
    };
    return priority(a) - priority(b);
  });

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">
      {/* ── 왼쪽 사이드바 ───────────────────────────────────────────── */}
      <aside className="w-52 shrink-0 bg-white border-r flex flex-col hidden md:flex overflow-hidden">
        <div className="p-3 border-b shrink-0">
          <button onClick={() => { setShowCompose(true); setComposeInit({}); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition">
            ✏️ 메일 쓰기
          </button>
        </div>

        {/* 계정 목록 */}
        <div className="p-2 shrink-0 border-b">
          {accounts.map(acc => (
            <button key={acc.id}
              onClick={() => { setSelectedAccount(acc); setFolder('INBOX'); setPage(1); }}
              className={`w-full flex items-start gap-2 px-2 py-2 rounded-lg text-left transition text-sm ${selectedAccount?.id === acc.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
              <span className="text-base mt-0.5">📧</span>
              <div className="min-w-0">
                <div className="font-medium truncate text-xs">{acc.name}</div>
                <div className="text-gray-400 truncate text-[10px]">{acc.email}</div>
              </div>
            </button>
          ))}
          <button onClick={() => setShowAddAccount(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition mt-1">
            <span>＋</span> 계정 추가
          </button>
        </div>

        {/* 폴더 목록 — 스크롤 가능 */}
        {sortedFolders.length > 0 && (
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-[10px] font-semibold text-gray-400 px-2 mb-1">폴더</p>
            {sortedFolders.map(f => {
              const { icon, label } = folderLabel(f);
              return (
                <button key={f.path}
                  onClick={() => { setFolder(f.path); setPage(1); setSelectedEmail(null); setDetail(null); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${folder === f.path ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <span className="text-sm">{icon}</span>
                  <span className="truncate text-xs">{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {accounts.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center text-sm text-gray-400">
              <p className="text-2xl mb-2">📭</p>
              <p>계정을 추가하세요</p>
            </div>
          </div>
        )}
      </aside>

      {/* ── 메일 목록 ───────────────────────────────────────────────── */}
      <section className={`w-full md:w-80 shrink-0 bg-white border-r flex flex-col overflow-hidden ${view === 'detail' ? 'hidden md:flex' : 'flex'}`}>
        {/* 모바일 툴바 */}
        <div className="md:hidden flex items-center gap-2 p-3 border-b">
          <button onClick={() => { setShowCompose(true); setComposeInit({}); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl">
            ✏️ 메일 쓰기
          </button>
          <button onClick={() => setShowAddAccount(true)}
            className="px-3 py-2 border rounded-xl text-sm text-gray-600">＋</button>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <div>
            <p className="font-semibold text-sm">{folderLabel({ path: folder, name: folder }).label}</p>
            {total > 0 && <p className="text-[10px] text-gray-400">{total}개</p>}
          </div>
          <button onClick={loadEmails} className="text-gray-400 hover:text-gray-600 text-sm p-1">🔄</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && emails.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
              <p className="text-2xl mb-1">📭</p>
              {accounts.length === 0 ? '계정을 추가해 주세요' : '메일이 없습니다'}
            </div>
          )}
          {emails.map(item => (
            <button key={item.uid}
              onClick={() => openEmail(item)}
              className={`w-full text-left border-b px-4 py-3 hover:bg-gray-50 transition ${selectedEmail?.uid === item.uid ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''} ${!item.seen ? 'bg-white' : 'bg-gray-50/50'}`}>
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <p className={`text-sm truncate ${!item.seen ? 'font-semibold' : 'text-gray-700'}`}>
                  {fmtFrom(item.from)}
                </p>
                <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{fmtDate(item.date)}</span>
              </div>
              <p className={`text-xs truncate mb-0.5 ${!item.seen ? 'font-medium' : 'text-gray-600'}`}>{item.subject}</p>
              <div className="flex items-center gap-1.5">
                {!item.seen && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                {item.hasAttachment && <span className="text-[10px] text-gray-400">📎</span>}
                {item.flagged && <span className="text-[10px]">⭐</span>}
              </div>
            </button>
          ))}

          {total > 30 && (
            <div className="flex items-center justify-center gap-3 p-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40">← 이전</button>
              <span className="text-xs text-gray-500">{page}페이지</span>
              <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40">다음 →</button>
            </div>
          )}
        </div>
      </section>

      {/* ── 메일 상세 ───────────────────────────────────────────────── */}
      <main className={`flex-1 bg-white flex flex-col overflow-hidden ${view === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {view === 'detail' && (
          <button onClick={() => setView('list')} className="md:hidden flex items-center gap-1.5 px-4 py-3 border-b text-sm text-blue-600">
            ← 목록
          </button>
        )}

        {!selectedEmail && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <p className="text-5xl mb-3">✉️</p>
            <p className="text-sm">메일을 선택하세요</p>
          </div>
        )}

        {selectedEmail && (
          <>
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : detail ? (
              <div className="flex flex-col h-full">
                {/* 헤더 */}
                <div className="px-6 py-4 border-b">
                  <h2 className="text-xl font-bold mb-3">{detail.subject}</h2>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 text-sm">
                      <div className="flex gap-2">
                        <span className="text-gray-400 w-10 shrink-0">보낸이</span>
                        <span>{detail.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ')}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-400 w-10 shrink-0">받는이</span>
                        <span className="text-gray-700">{detail.to.map(f => f.name || f.address).join(', ')}</span>
                      </div>
                      {detail.cc.length > 0 && (
                        <div className="flex gap-2">
                          <span className="text-gray-400 w-10 shrink-0">참조</span>
                          <span className="text-gray-700">{detail.cc.map(f => f.name || f.address).join(', ')}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <span className="text-gray-400 w-10 shrink-0">날짜</span>
                        <span className="text-gray-500">{detail.date ? new Date(detail.date).toLocaleString('ko-KR') : '-'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button onClick={replyTo}
                        className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 flex items-center gap-1">
                        ↩ 답장
                      </button>
                      <button onClick={forwardEmail}
                        className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50 flex items-center gap-1">
                        → 전달
                      </button>
                    </div>
                  </div>

                  {detail.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                      {detail.attachments.map((a, i) => (
                        <a key={i}
                          href={`data:${a.contentType};base64,${a.content}`}
                          download={a.filename}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition">
                          📎 {a.filename}
                          <span className="text-gray-400">({Math.round(a.size / 1024)}KB)</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* 본문 */}
                <div className="flex-1 overflow-y-auto">
                  {detail.html ? (
                    <iframe
                      srcDoc={detail.html}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      title="email-body"
                    />
                  ) : (
                    <pre className="p-6 text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {detail.text || '(내용 없음)'}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
                메일을 불러올 수 없습니다
              </div>
            )}
          </>
        )}
      </main>

      {/* ── 모달 ────────────────────────────────────────────────────── */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdded={acc => setAccounts(prev => [...prev, acc])}
        />
      )}
      {showCompose && selectedAccount && (
        <ComposeModal
          accountId={selectedAccount.id}
          initial={composeInit}
          onClose={() => setShowCompose(false)}
          onSent={loadEmails}
        />
      )}
    </div>
  );
}
