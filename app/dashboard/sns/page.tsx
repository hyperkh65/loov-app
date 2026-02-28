'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';

const SNS_CHANNELS = [
  { key: 'instagram' as const, label: '인스타그램', icon: '📸', color: 'from-pink-500 to-purple-600', placeholder: '@username 또는 프로필 URL', tips: ['일 1-2회 피드 포스팅', '스토리 매일 업데이트', '릴스로 노출 극대화', '해시태그 30개 활용'] },
  { key: 'twitter' as const, label: '트위터/X', icon: '🐦', color: 'from-blue-400 to-blue-600', placeholder: '@handle', tips: ['하루 3-5회 트윗', '트렌드 키워드 활용', '리트윗 및 답글로 소통', '스레드로 심층 콘텐츠'] },
  { key: 'linkedin' as const, label: '링크드인', icon: '💼', color: 'from-blue-600 to-blue-800', placeholder: '프로필 URL', tips: ['주 3-4회 포스팅', 'B2B 타겟 콘텐츠', '업계 인사이트 공유', '네트워킹 적극 활동'] },
  { key: 'facebook' as const, label: '페이스북', icon: '📘', color: 'from-blue-500 to-blue-700', placeholder: '페이지 URL', tips: ['그룹 참여로 커뮤니티 구축', '이벤트 홍보 활용', '영상 콘텐츠 우선', '유료 광고 효율적'] },
  { key: 'youtube' as const, label: '유튜브', icon: '▶️', color: 'from-red-500 to-red-700', placeholder: '채널 URL', tips: ['주 1-2회 영상 업로드', 'SEO 최적화 제목/설명', '썸네일 클릭률 중요', '쇼츠로 빠른 성장'] },
  { key: 'tiktok' as const, label: '틱톡', icon: '🎵', color: 'from-gray-800 to-black', placeholder: '@username', tips: ['트렌드 챌린지 참여', '짧고 임팩트 있는 영상', '매일 1-3회 업로드', '오디오 트렌드 활용'] },
  { key: 'kakao' as const, label: '카카오', icon: '💬', color: 'from-yellow-400 to-yellow-500', placeholder: '카카오톡 채널 ID', tips: ['채널 친구 유도 이벤트', '쿠폰/혜택 발송', '1:1 채팅 상담', '카카오 광고 활용'] },
];

interface PostIdeaForm {
  platform: string;
  type: 'feed' | 'story' | 'reel' | 'article';
  topic: string;
}

export default function SNSPage() {
  const { companySettings, updateCompanySettings } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [ideaForm, setIdeaForm] = useState<PostIdeaForm>({ platform: 'instagram', type: 'feed', topic: '' });
  const [generatedIdea, setGeneratedIdea] = useState('');

  const getAccount = (key: string): string => {
    const settings = companySettings as unknown as Record<string, string>;
    return settings[key] || '';
  };

  const handleSave = (key: string) => {
    updateCompanySettings({ [key]: tempValue } as Parameters<typeof updateCompanySettings>[0]);
    setEditing(null);
  };

  const handleGenerate = () => {
    const platform = SNS_CHANNELS.find((c) => c.key === ideaForm.platform);
    const ideas = [
      `✨ [${platform?.label} ${ideaForm.type === 'feed' ? '피드' : ideaForm.type === 'story' ? '스토리' : ideaForm.type === 'reel' ? '릴스' : '아티클'}]\n\n주제: "${ideaForm.topic}"\n\n🎯 핵심 메시지: ${ideaForm.topic}에 관심 있는 분들을 위한 실용적인 콘텐츠\n\n📝 콘텐츠 아이디어:\n1. 문제 제시 - 대부분의 사람들이 겪는 ${ideaForm.topic} 관련 어려움\n2. 해결책 공개 - 우리만의 방법론 소개\n3. 실제 사례 - 고객 성공 스토리\n4. 행동 유도 - 프로필 링크 클릭 또는 DM 유도\n\n#${ideaForm.topic.replace(/\s/g, '')} #1인기업 #BOSSAI`,
    ];
    setGeneratedIdea(ideas[0]);
  };

  const connectedCount = SNS_CHANNELS.filter((c) => getAccount(c.key)).length;

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🌐 SNS 관리</h1>
            <p className="text-sm text-gray-400">소셜 미디어 채널 연동 및 콘텐츠 관리</p>
          </div>
          <div className="text-sm text-gray-400">
            {connectedCount}/{SNS_CHANNELS.length}개 채널 연결됨
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* SNS 채널 등록 */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-4">채널 계정 등록</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {SNS_CHANNELS.map((channel) => {
              const account = getAccount(channel.key);
              const isEditing = editing === channel.key;
              return (
                <div key={channel.key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className={`h-1.5 bg-gradient-to-r ${channel.color}`} />
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${channel.color} flex items-center justify-center text-xl`}>
                        {channel.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-800">{channel.label}</div>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${account ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                          <span className="text-xs text-gray-400">{account ? '연결됨' : '미연결'}</span>
                        </div>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          value={tempValue}
                          onChange={(e) => setTempValue(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
                          placeholder={channel.placeholder}
                          autoFocus
                        />
                        <button onClick={() => handleSave(channel.key)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">저장</button>
                        <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xs px-2">취소</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-sm text-gray-500 truncate font-mono text-xs">
                          {account || channel.placeholder}
                        </div>
                        <button
                          onClick={() => { setEditing(channel.key); setTempValue(account); }}
                          className="text-xs text-indigo-600 hover:text-indigo-500 flex-shrink-0 font-medium">
                          {account ? '수정' : '등록'}
                        </button>
                      </div>
                    )}

                    {/* 운영 팁 */}
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <div className="text-[10px] text-gray-400 font-semibold mb-1.5">운영 팁</div>
                      <div className="space-y-0.5">
                        {channel.tips.slice(0, 2).map((tip) => (
                          <div key={tip} className="text-[10px] text-gray-400 flex items-center gap-1">
                            <span className="text-indigo-400">·</span> {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 콘텐츠 아이디어 생성기 */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">✨ 콘텐츠 아이디어 생성기</h2>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">플랫폼</label>
              <select value={ideaForm.platform} onChange={(e) => setIdeaForm({ ...ideaForm, platform: e.target.value })}
                className="w-full border border-white bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                {SNS_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">형식</label>
              <select value={ideaForm.type} onChange={(e) => setIdeaForm({ ...ideaForm, type: e.target.value as PostIdeaForm['type'] })}
                className="w-full border border-white bg-white rounded-xl px-3 py-2 text-sm focus:outline-none">
                <option value="feed">피드</option>
                <option value="story">스토리</option>
                <option value="reel">릴스/쇼츠</option>
                <option value="article">아티클</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">주제</label>
              <input value={ideaForm.topic} onChange={(e) => setIdeaForm({ ...ideaForm, topic: e.target.value })}
                className="w-full border border-white bg-white rounded-xl px-3 py-2 text-sm focus:outline-none"
                placeholder="AI 생산성, 1인기업..." />
            </div>
          </div>
          <button onClick={handleGenerate} disabled={!ideaForm.topic.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors">
            ✨ 아이디어 생성
          </button>

          {generatedIdea && (
            <div className="mt-4 bg-white rounded-xl border border-indigo-100 p-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{generatedIdea}</pre>
              <div className="flex gap-2 mt-3">
                <button onClick={() => navigator.clipboard.writeText(generatedIdea)}
                  className="text-xs text-indigo-600 hover:text-indigo-500 border border-indigo-200 px-3 py-1.5 rounded-lg">
                  복사
                </button>
                <button onClick={() => setGeneratedIdea('')} className="text-xs text-gray-400 hover:text-gray-600">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 콘텐츠 캘린더 안내 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-bold text-gray-900 mb-4">📅 콘텐츠 캘린더</h2>
          <p className="text-sm text-gray-500 mb-4">마케팅 AI 직원에게 콘텐츠 캘린더를 관리하도록 지시하면, 대시보드에서 일정이 자동으로 표시됩니다.</p>
          <a href="/dashboard/marketing" className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-600 text-sm px-4 py-2.5 rounded-xl font-medium hover:bg-orange-100 transition-colors">
            📣 마케팅 허브에서 캠페인 관리 →
          </a>
        </div>
      </div>
    </div>
  );
}
