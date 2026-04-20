'use client';

export default function MarketPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">📊 시장 조사</h1>
        <p className="text-gray-400 text-sm">트렌드 분석 및 시장 리서치 도구</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {[
          { icon: '🔍', title: '키워드 트렌드', desc: '구글 트렌드 & 네이버 트렌드 분석', badge: '준비중' },
          { icon: '🏆', title: '경쟁사 분석', desc: '경쟁사 웹사이트 및 SNS 모니터링', badge: '준비중' },
          { icon: '📰', title: '뉴스 클리핑', desc: '키워드별 뉴스 자동 수집', badge: '준비중' },
          { icon: '💹', title: '시장 규모 조사', desc: 'AI 기반 TAM/SAM/SOM 분석', badge: '준비중' },
        ].map((item) => (
          <div
            key={item.title}
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex gap-4 items-start opacity-70"
          >
            <span className="text-3xl">{item.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-white">{item.title}</h3>
                <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              </div>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
