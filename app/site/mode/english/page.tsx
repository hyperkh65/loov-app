'use client';

export default function EnglishPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">🇺🇸 영어 공부</h1>
        <p className="text-gray-400 text-sm">영어 학습 도구 모음</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {[
          { icon: '💬', title: 'AI 회화 연습', desc: '실제 상황 기반 영어 대화 연습', badge: '준비중' },
          { icon: '📖', title: '단어장', desc: '학습한 단어 저장 및 복습', badge: '준비중' },
          { icon: '🎙️', title: '발음 교정', desc: '음성 인식 기반 발음 피드백', badge: '준비중' },
          { icon: '📝', title: '문법 교정', desc: '내가 쓴 영어 문장 교정', badge: '준비중' },
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
