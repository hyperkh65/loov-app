'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          company_name: companyName,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // 회원가입 성공 → 이메일 확인 필요 없이 바로 대시보드로
    if (data.session) {
      router.push('/dashboard');
    } else {
      // 이메일 확인이 필요한 경우
      setDone(true);
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#06091a] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📧</div>
          <h2 className="text-2xl font-black text-white mb-2">이메일을 확인하세요</h2>
          <p className="text-gray-400 mb-4">
            <strong className="text-white">{email}</strong>로 확인 링크를 보냈습니다.<br />
            링크를 클릭하면 대시보드로 이동합니다.
          </p>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm mb-6 text-left">
            <p className="font-semibold mb-1">메일이 안 보이시나요?</p>
            <ul className="space-y-1 text-amber-400/80 text-xs">
              <li>• 스팸/정크 메일함을 확인해 주세요</li>
              <li>• Supabase 무료 플랜은 발송에 수 분이 걸릴 수 있습니다</li>
              <li>• 관리자에게 문의하면 즉시 계정을 활성화할 수 있습니다</li>
            </ul>
          </div>
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 text-sm">
            로그인 페이지로 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06091a] flex items-center justify-center px-4">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-purple-600/15 rounded-full blur-[100px]" />

      <div className="relative w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-base font-black text-white">L</div>
            <span className="font-black text-white text-xl">LOOV</span>
          </Link>
          <h1 className="text-2xl font-black text-white mt-2">무료로 시작하기</h1>
          <p className="text-gray-400 text-sm mt-1">AI 직원 1명 · 신용카드 불필요</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1.5 block">대표자 이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1.5 block">회사명</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400"
                  placeholder="내 회사"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 block">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 block">비밀번호 (6자 이상)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-indigo-400"
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
              disabled={loading || !email || !password || !name}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-all">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  계정 생성 중...
                </span>
              ) : 'AI 팀 만들기 →'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <span className="text-gray-500 text-sm">이미 계정이 있으신가요? </span>
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold">
              로그인
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
