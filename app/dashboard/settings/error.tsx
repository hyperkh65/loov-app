'use client';

import { useEffect } from 'react';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Settings page error:', error);
  }, [error]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-red-800">⚠️ 설정 페이지 오류</h2>
        <div className="bg-white rounded-xl p-4 border border-red-100">
          <p className="text-xs font-semibold text-gray-500 mb-1">에러 메시지:</p>
          <p className="text-sm font-mono text-red-700 break-all">{error.message}</p>
          {error.stack && (
            <details className="mt-3">
              <summary className="text-xs text-gray-400 cursor-pointer">스택 트레이스 보기</summary>
              <pre className="mt-2 text-[10px] text-gray-500 overflow-auto max-h-48 bg-gray-50 p-2 rounded">{error.stack}</pre>
            </details>
          )}
        </div>
        <button
          onClick={reset}
          className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold"
        >
          🔄 다시 시도
        </button>
      </div>
    </div>
  );
}
