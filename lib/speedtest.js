// lib/speedtest.js
// Cloudflare 공개 speed test 엔드포인트로 다운로드 속도 + 지연시간 측정.
// https://speed.cloudflare.com/ — CORS 허용, 무인증.

const BASE = 'https://speed.cloudflare.com';

/**
 * 지연시간 측정 (4번 ping, 최소값 반환).
 */
async function measureLatency() {
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    try {
      await fetch(`${BASE}/__down?bytes=1&_=${Math.random()}`, {
        cache: 'no-store',
      });
      samples.push(performance.now() - t0);
    } catch {
      /* skip */
    }
  }
  if (samples.length === 0) throw new Error('Latency 측정 실패 (네트워크 차단?)');
  return Math.round(Math.min(...samples));
}

/**
 * 알려진 사이즈를 다운로드하면서 속도 계산.
 * 진행률 콜백: { downloaded, total, progress }
 */
async function downloadTest(bytes, onProgress) {
  const url = `${BASE}/__down?bytes=${bytes}&_=${Math.random()}`;
  const t0 = performance.now();

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error('스트리밍 미지원');

  const reader = res.body.getReader();
  let downloaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    downloaded += value.byteLength;
    if (onProgress) {
      onProgress({
        downloaded,
        total: bytes,
        progress: Math.min(1, downloaded / bytes),
      });
    }
  }

  const elapsedSec = (performance.now() - t0) / 1000;
  const mbps = (downloaded * 8) / 1_000_000 / elapsedSec;
  return { mbps, elapsedSec, bytes: downloaded };
}

/**
 * 전체 속도 측정 흐름.
 * 단계 콜백: { stage: 'latency'|'warmup'|'measuring', progress?: 0..1 }
 *
 * @returns {downloadMbps, latencyMs, elapsedSec}
 */
export async function measureSpeed(onProgress) {
  // 1) 지연시간
  if (onProgress) onProgress({ stage: 'latency' });
  const latencyMs = await measureLatency();

  // 2) 워밍업 (작은 파일, 결과 버림)
  if (onProgress) onProgress({ stage: 'warmup' });
  await downloadTest(500_000);

  // 3) 본 측정 (5MB)
  if (onProgress) onProgress({ stage: 'measuring', progress: 0 });
  const result = await downloadTest(5_000_000, (p) => {
    if (onProgress) onProgress({ stage: 'measuring', progress: p.progress });
  });

  return {
    downloadMbps: Math.round(result.mbps * 10) / 10,
    latencyMs,
    elapsedSec: Math.round(result.elapsedSec * 10) / 10,
  };
}

/**
 * 속도 값 → 등급. 시각화/색상에 활용.
 */
export function speedTier(mbps) {
  if (!mbps) return 'unknown';
  if (mbps >= 50) return 'excellent'; // 작업하기 좋은
  if (mbps >= 20) return 'good';      // 일반 작업 OK
  if (mbps >= 5)  return 'ok';        // 웹 서핑 OK
  return 'slow';                       // 답답함
}

export function speedTierLabel(tier) {
  return {
    excellent: '쾌적',
    good: '양호',
    ok: '보통',
    slow: '느림',
    unknown: '-',
  }[tier];
}
