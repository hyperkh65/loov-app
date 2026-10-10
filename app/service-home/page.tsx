import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '0',
    desc: '소규모 팀을 위한 무료 플랜',
    features: [
      'AI 채팅 월 100회',
      '직원 3명까지',
      '기본 ERP 기능',
      '1GB 스토리지',
    ],
    cta: '무료로 시작',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '29,000',
    desc: '성장하는 비즈니스를 위한 플랜',
    features: [
      'AI 채팅 무제한',
      '직원 20명까지',
      '전체 ERP + 자동화',
      '50GB 스토리지',
      'NAS 연동',
      '우선 지원',
    ],
    cta: '14일 무료 체험',
    highlight: true,
  },
  {
    name: 'Business',
    price: '99,000',
    desc: '대규모 조직을 위한 엔터프라이즈 플랜',
    features: [
      'AI 채팅 무제한',
      '직원 무제한',
      '전체 기능 + API 접근',
      '500GB 스토리지',
      'NAS + CCTV + WordPress',
      '전담 지원',
      '커스텀 도메인',
    ],
    cta: '영업팀 문의',
    highlight: false,
  },
];

export default function ServiceHomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-black text-white">
            L
          </div>
          <span className="font-black text-white text-lg tracking-tight">LOOV</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            가입하기
          </Link>
        </nav>
      </header>

      {/* 히어로 */}
      <section className="text-center py-24 px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-indigo-950 border border-indigo-800 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-semibold mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          AI 기반 비즈니스 자동화
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-white leading-tight mb-6">
          비즈니스를 자동화하는
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            AI 플랫폼
          </span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          ERP, AI 채팅, NAS 연동, CCTV, WordPress 자동화까지.
          <br />
          LOOV 하나로 모든 비즈니스 워크플로우를 자동화하세요.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-indigo-900/40"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors border border-slate-700"
          >
            로그인
          </Link>
        </div>
      </section>

      {/* 기능 하이라이트 */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '🤖', label: 'AI 채팅', desc: 'GPT, Claude, Gemini' },
            { icon: '📊', label: 'ERP', desc: '영업·회계·프로젝트' },
            { icon: '🖥️', label: 'NAS 연동', desc: 'Synology NAS 관리' },
            { icon: '📹', label: 'CCTV', desc: '실시간 스트리밍' },
          ].map((f) => (
            <div key={f.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center hover:border-indigo-800 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <div className="font-bold text-white text-sm mb-1">{f.label}</div>
              <div className="text-slate-500 text-xs">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 플랜 카드 */}
      <section className="py-16 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-3">합리적인 가격</h2>
          <p className="text-slate-400">비즈니스 규모에 맞는 플랜을 선택하세요</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-7 flex flex-col gap-5 border transition-all ${
                plan.highlight
                  ? 'bg-gradient-to-b from-indigo-950 to-slate-900 border-indigo-600 shadow-xl shadow-indigo-900/30'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                  가장 인기
                </div>
              )}
              <div>
                <div className="text-slate-400 text-sm font-semibold mb-1">{plan.name}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-black text-white">{plan.price}</span>
                  {plan.price !== '0' && <span className="text-slate-400 text-sm mb-1">원/월</span>}
                  {plan.price === '0' && <span className="text-slate-400 text-sm mb-1">원</span>}
                </div>
                <div className="text-slate-500 text-xs">{plan.desc}</div>
              </div>
              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                    <span className="w-4 h-4 rounded-full bg-indigo-900 text-indigo-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`text-center font-bold py-3 rounded-xl transition-all text-sm ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-900/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t border-slate-800 py-8 px-6 text-center text-slate-600 text-sm max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-black text-white">
            L
          </div>
          <span className="font-bold text-slate-500">LOOV</span>
        </div>
        <p>© 2026 LOOV. All rights reserved.</p>
      </footer>
    </div>
  );
}
