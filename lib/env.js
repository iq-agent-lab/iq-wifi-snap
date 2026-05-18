// lib/env.js
// 브라우저 환경 감지 (인앱 브라우저, 플랫폼, 설치 상태).

const ua = navigator.userAgent;

const platform = {
  isIOS: /iPad|iPhone|iPod/.test(ua) && !window.MSStream,
  isAndroid: /Android/.test(ua),
  isStandalone:
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true,
};

const inAppPatterns = [
  { name: '카카오톡', re: /KAKAOTALK/i, key: 'kakao' },
  { name: '네이버', re: /\bNAVER\b/i, key: 'naver' },
  { name: '인스타그램', re: /Instagram/i, key: 'instagram' },
  { name: '페이스북', re: /FBAN|FBAV|FB_IAB/i, key: 'facebook' },
  { name: '라인', re: /\bLine\b/i, key: 'line' },
  { name: '카카오스토리', re: /KAKAOSTORY/i, key: 'kakaostory' },
];

let inApp = null;
for (const p of inAppPatterns) {
  if (p.re.test(ua)) {
    inApp = { name: p.name, key: p.key };
    break;
  }
}

export const env = {
  ...platform,
  inApp, // null이거나 {name, key}
  isInAppBrowser: !!inApp,
};

/**
 * 카카오톡 안드로이드면 외부 브라우저로 점프 가능 (custom URL scheme).
 * iOS는 보통 불가능 — 안내만 가능.
 */
export function canDeepLinkOutOfInApp() {
  return env.inApp?.key === 'kakao' && env.isAndroid;
}

/**
 * 외부 브라우저로 현재 URL 열기 시도.
 */
export function openInExternalBrowser() {
  const currentUrl = window.location.href;
  if (env.inApp?.key === 'kakao' && env.isAndroid) {
    // Kakao Android 전용 스킴
    window.location.href =
      'kakaotalk://web/openExternal?url=' + encodeURIComponent(currentUrl);
    return true;
  }
  return false;
}
