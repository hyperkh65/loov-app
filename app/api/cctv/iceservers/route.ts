import { NextResponse } from 'next/server';

/**
 * WebRTC ICE 서버 설정 API
 * 우선순위: Metered.ca (신뢰성 높은 TURN) → 커스텀 TURN → openrelay (폴백)
 *
 * 환경변수:
 *   METERED_API_KEY   - Metered.ca API 키 (https://dashboard.metered.ca)
 *   METERED_APP_NAME  - Metered.ca 앱 이름 (예: "loov")
 *   TURN_URL          - 커스텀 TURN 서버 URL
 *   TURN_USERNAME     - 커스텀 TURN 사용자명
 *   TURN_CREDENTIAL   - 커스텀 TURN 비밀번호
 */
export async function GET() {
  const stunServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // 1순위: Metered.ca — 에페머럴 자격증명 (1시간 유효, 스니핑 불가)
  const meteredApiKey = process.env.METERED_API_KEY;
  const meteredAppName = process.env.METERED_APP_NAME;
  if (meteredApiKey && meteredAppName) {
    try {
      const res = await fetch(
        `https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const turnServers = await res.json();
        return NextResponse.json(
          { iceServers: [...stunServers, ...turnServers] },
          { headers: { 'Cache-Control': 'private, max-age=3600' } }
        );
      }
    } catch { /* 폴백으로 */ }
  }

  // 2순위: 커스텀 TURN 서버 (환경변수 직접 설정)
  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;
  if (turnUrl) {
    return NextResponse.json({
      iceServers: [
        ...stunServers,
        { urls: turnUrl, username: turnUsername ?? '', credential: turnCredential ?? '' },
      ],
    });
  }

  // 3순위: openrelay 폴백 (무료지만 불안정 — METERED_API_KEY 설정 권장)
  return NextResponse.json({
    iceServers: [
      ...stunServers,
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turns:openrelay.metered.ca:443',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
  });
}
