// lib/kakao.js
// Kakao JS SDK 동적 로딩 + 공유 함수.
// SDK는 첫 공유 시점에만 로드(평소엔 페이로드 0).

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
let sdkPromise = null;

function loadSdk() {
  if (window.Kakao) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(
        new Error(
          'Kakao SDK를 불러오지 못했습니다. 네트워크 또는 광고 차단 확인이 필요해요.'
        )
      );
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/**
 * Kakao SDK 초기화. 키가 바뀌면 자동으로 재초기화.
 */
async function ensureKakaoInit(jsKey) {
  if (!jsKey) throw new Error('Kakao 앱 키가 설정되지 않았습니다');
  await loadSdk();
  if (!window.Kakao) throw new Error('Kakao 객체가 없습니다');

  if (window.Kakao.isInitialized()) {
    // 키가 다를 수도 있음 — 재설정
    if (window.Kakao.__initializedKey !== jsKey) {
      window.Kakao.cleanup();
      window.Kakao.init(jsKey);
      window.Kakao.__initializedKey = jsKey;
    }
  } else {
    window.Kakao.init(jsKey);
    window.Kakao.__initializedKey = jsKey;
  }
}

/**
 * 카카오톡 공유 (Feed 템플릿).
 *
 * @param {object} opts
 * @param {string} opts.jsKey   카카오 JS 앱 키
 * @param {string} opts.title    공유 카드 제목
 * @param {string} opts.description  설명
 * @param {string} opts.url     클릭 시 이동할 URL (보통 wifi 딥링크)
 * @param {string} [opts.imageUrl]  썸네일 이미지 URL (절대 URL)
 * @param {string} [opts.buttonLabel] 카드 하단 버튼 라벨
 */
export async function shareToKakao({
  jsKey,
  title,
  description,
  url,
  imageUrl,
  buttonLabel = '와이파이 접속하기',
}) {
  await ensureKakaoInit(jsKey);

  // Kakao.Share.sendDefault는 동기적으로 팝업/앱 띄움.
  // 2.x SDK는 콜백 없음 — 호출 자체가 실패해도 throw로 잡힘.
  window.Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title,
      description: description || '',
      imageUrl: imageUrl || '',
      link: {
        mobileWebUrl: url,
        webUrl: url,
      },
    },
    buttons: [
      {
        title: buttonLabel,
        link: {
          mobileWebUrl: url,
          webUrl: url,
        },
      },
    ],
  });
}

/**
 * 키가 형식적으로 유효한지 가벼운 체크 (32자 영숫자).
 */
export function looksLikeKakaoKey(s) {
  return typeof s === 'string' && /^[a-f0-9]{32}$/i.test(s.trim());
}
