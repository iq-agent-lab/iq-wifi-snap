// lib/share.js
// 공유 링크 인코딩/디코딩 + Web Share API + QR PNG 다운로드

/**
 * 공유 URL 생성 - 와이파이 정보를 base64-encoded JSON으로 URL 파라미터에 담음.
 * 받는 사람은 API 키 없이도 즉시 QR을 볼 수 있음.
 *
 * 형식: <base>/?wifi=eyJzc2lkIjoiU3RhcmJ1Y2tzIiwicHciOiIxMjM0Iiwic2VjIjoiV1BBIn0=
 */
export function createShareUrl({ ssid, password, security = 'WPA', label = null }) {
  const payload = {
    s: ssid,
    p: password || '',
    t: security,
  };
  if (label) payload.l = label;

  // URL-safe base64 (no padding, +/- swapped to -_)
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('wifi', b64);
  return url.toString();
}

/**
 * URL 파라미터에서 와이파이 정보 디코드. 없거나 잘못된 형식이면 null.
 */
export function parseShareUrl(search) {
  const params = new URLSearchParams(search);
  const raw = params.get('wifi');
  if (!raw) return null;
  try {
    // URL-safe → standard base64 + padding 복원
    let b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    const data = JSON.parse(json);
    if (!data.s) return null;
    return {
      ssid: data.s,
      password: data.p || '',
      security: data.t || 'WPA',
      label: data.l || null,
    };
  } catch {
    return null;
  }
}

/**
 * Web Share API로 공유. 모바일에서는 네이티브 공유 시트(카톡/메시지/AirDrop 등) 표시.
 * 지원 안 되는 환경(데스크톱 일부)에서는 클립보드 복사로 폴백.
 */
export async function shareViaSystem({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: 'share' };
    } catch (e) {
      // 사용자가 취소한 경우는 정상
      if (e.name === 'AbortError') return { ok: false, method: 'cancel' };
      // 다른 에러는 폴백
    }
  }
  // 폴백: 클립보드 복사
  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, method: 'clipboard' };
  } catch {
    return { ok: false, method: 'none' };
  }
}

/**
 * QR을 PNG 파일로 다운로드.
 * qrcodejs는 div 안에 <img> 또는 <canvas>를 만듦. 둘 다 처리.
 */
export function downloadQR(qrContainerEl, filename = 'wifi-qr.png') {
  const canvas = qrContainerEl.querySelector('canvas');
  const img = qrContainerEl.querySelector('img');

  let dataUrl;
  if (canvas) {
    dataUrl = canvas.toDataURL('image/png');
  } else if (img && img.src) {
    dataUrl = img.src;
  } else {
    throw new Error('QR을 찾을 수 없습니다');
  }

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 텍스트 + 와이파이 정보를 묶은 공유 메시지 생성.
 */
export function buildShareText({ ssid, password, label }) {
  const head = label ? `${label} 와이파이` : '와이파이 정보';
  if (password) {
    return `${head}\nSSID: ${ssid}\n비밀번호: ${password}`;
  }
  return `${head}\nSSID: ${ssid}`;
}
