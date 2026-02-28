'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 8000)
      );
      const request = supabase.auth.signInWithPassword({ email, password });
      const { error } = await Promise.race([request, timeout]) as Awaited<typeof request>;

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          setError('이메일 인증이 필요합니다. Supabase 대시보드에서 계정을 수동 확인해 주세요.');
        } else if (error.message === 'Invalid login credentials') {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(`오류: ${error.message}`);
        }
      } else {
        router.push('/dashboard');
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'TIMEOUT') {
        setError('서버 응답 없음. Supabase 프로젝트가 일시정지 상태일 수 있습니다.\nsupabase.com/dashboard 에서 프로젝트를 재개해 주세요.');
      } else {
        setError(`연결 오류: ${msg}`);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#06091a] flex items-center justify-center px-4">
      {/* 배경 빛 */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-indigo-600/15 rounded-full blur-[100px]" />

      <div className="relative w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-base font-black text-white">L</div>
            <span className="font-black text-white text-xl">LOOV</span>
          </Link>
          <h1 className="text-2xl font-black text-white mt-2">로그인</h1>
          <p className="text-gray-400 text-sm mt-1">AI 팀에게 오늘의 업무를 지시하세요</p>
        </div>

        {/* 폼 카드 */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 block">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400 transition-colors"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 block">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-all mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : '로그인'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <span className="text-gray-500 text-sm">계정이 없으신가요? </span>
            <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors">
              무료 시작
            </Link>
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          <Link href="/" className="hover:text-gray-400 transition-colors">← 서비스 소개</Link>
        </p>
      </div>
    </div>
  );
}
