// lib/ocr.js
// Tesseract.js 동적 로딩 + 워커 관리.
//
// 동작:
//  - SDK는 첫 사용 시점에만 로드(평소 페이로드 0)
//  - 한국어 + 영어 언어 데이터는 Tesseract가 IndexedDB에 자동 캐시
//  - 한 번 다운받으면 그 이후엔 오프라인에서도 작동
//
// 사용 패턴:
//   await prepareOcr(onProgress);  // 사전 준비 (UI에서 명시적으로)
//   const text = await runOcr(dataUrl, onProgress);
//   await cleanupOcr();  // 메모리 회수

const TESSERACT_URL =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let sdkPromise = null;
let worker = null;

function loadSdk() {
  if (window.Tesseract) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('Tesseract.js를 불러오지 못했습니다.'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * 워커 생성 + 언어 로딩. 진행률 콜백 전달 가능.
 * onProgress: {status, progress} 객체 받음.
 */
export async function prepareOcr(onProgress) {
  await loadSdk();
  if (worker) return; // 이미 준비됨

  worker = await window.Tesseract.createWorker(['kor', 'eng'], 1, {
    logger: (m) => {
      if (onProgress) onProgress(m);
    },
  });
}

/**
 * 준비 상태 확인.
 */
export function isOcrReady() {
  return !!worker;
}

/**
 * 이미지 dataURL을 받아 텍스트 추출.
 */
export async function runOcr(dataUrl, onProgress) {
  if (!worker) await prepareOcr(onProgress);
  const { data } = await worker.recognize(dataUrl);
  return data.text;
}

/**
 * 워커 정리 (메모리 회수). 다시 쓰려면 prepareOcr() 호출.
 */
export async function cleanupOcr() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
