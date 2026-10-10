/**
 * Next.js standalone 서버 래퍼
 * Node.js HTTP 서버 타임아웃을 제거하여 AI 생성 등 장시간 요청이 끊기지 않게 함
 * NAS 자체 서버용 (Vercel maxDuration은 self-hosted에서 무효)
 */
const http = require('http');

// createServer 패치: 생성되는 모든 HTTP 서버에 타임아웃 제거 적용
const origCreateServer = http.createServer.bind(http);
http.createServer = function (...args) {
  const server = origCreateServer(...args);
  server.setTimeout(0);          // 요청 타임아웃 없음
  server.keepAliveTimeout = 0;   // keep-alive 타임아웃 없음
  server.headersTimeout = 0;     // 헤더 수신 타임아웃 없음
  return server;
};

// Next.js standalone 서버 실행
require('./server.js');
