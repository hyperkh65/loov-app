'use client';

export default function ModeSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          🟣 mode.loov.co.kr 설정
        </h1>
        <p className="text-gray-500 text-sm">
          mode 사이트의 기능별 설정을 관리합니다.
          <a
            href="https://mode.loov.co.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-purple-500 hover:underline"
          >
            사이트 바로가기 →
          </a>
        </p>
      </div>

      <div className="grid gap-4">
        {/* YouTube 다운로드 설정 */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span>📥</span> YouTube 다운로드 설정
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">NAS 저장 경로</label>
              <input
                type="text"
                defaultValue="/volume1/homes/urjent/youtube_downloads"
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">기본 화질</label>
              <select className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200">
                <option value="best">최고화질</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
              </select>
            </div>
          </div>
          <div className="mt-4 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
            NAS에 yt-dlp가 설치되어 있어야 합니다. SSH로 접속 후 <code>pip install yt-dlp</code> 실행
          </div>
        </section>

        {/* 영어 공부 설정 (준비중) */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 opacity-60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2">
            <span>🇺🇸</span> 영어 공부 설정
            <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-500 px-2 py-0.5 rounded-full">준비중</span>
          </h2>
          <p className="text-sm text-gray-400">기능 개발 후 설정 항목이 추가됩니다.</p>
        </section>

        {/* 시장 조사 설정 (준비중) */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 opacity-60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2">
            <span>📊</span> 시장 조사 설정
            <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-500 px-2 py-0.5 rounded-full">준비중</span>
          </h2>
          <p className="text-sm text-gray-400">기능 개발 후 설정 항목이 추가됩니다.</p>
        </section>
      </div>

      <div className="flex justify-end">
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          저장
        </button>
      </div>
    </div>
  );
}
