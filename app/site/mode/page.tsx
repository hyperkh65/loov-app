import Link from 'next/link';

const FEATURES = [
  {
    href: '/site/mode/youtube',
    icon: '📥',
    title: 'YouTube 다운로드',
    desc: '유튜브 영상을 시놀로지 NAS에 직접 저장',
    color: 'from-red-500/20 to-red-600/10 border-red-500/30',
  },
  {
    href: '/site/mode/english',
    icon: '🇺🇸',
    title: '영어 공부',
    desc: '영어 학습 자료 및 AI 회화 연습',
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  },
  {
    href: '/site/mode/market',
    icon: '📊',
    title: '시장 조사',
    desc: '트렌드 분석 및 시장 리서치 도구',
    color: 'from-green-500/20 to-green-600/10 border-green-500/30',
  },
];

export default function ModePage() {
  return (
    <div className="space-y-8">
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-white mb-2">mode</h1>
        <p className="text-gray-400">개인 생산성 도구 모음</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className={`block p-6 rounded-xl border bg-gradient-to-br ${f.color} hover:scale-[1.02] transition-transform`}
          >
            <div className="text-4xl mb-3">{f.icon}</div>
            <h2 className="text-lg font-semibold text-white mb-1">{f.title}</h2>
            <p className="text-sm text-gray-400">{f.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
