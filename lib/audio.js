// lib/audio.js
// ggwave 동적 로딩 + 오디오 송수신.
// https://github.com/ggerganov/ggwave
//
// 프로토콜: WS\t<ssid>\t<password>\t<security>[\t<label>]
//   탭 구분. WS 매직 prefix로 유효성 검증.
//   AUDIBLE_FAST = 16 bytes/sec → 일반적 페이로드 ~25바이트는 ~1.5초.

const GGWAVE_URL =
  'https://cdn.jsdelivr.net/gh/ggerganov/ggwave@v0.4.2/bindings/javascript/ggwave.js';

let ggwave = null;
let instance = null;
let lastSampleRate = null;

/**
 * ggwave 라이브러리 로드 + 초기화. sampleRate가 바뀌면 재초기화.
 */
async function loadGgwave(sampleRate) {
  // 스크립트 한 번만 로드
  if (!window.ggwave_factory) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GGWAVE_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () =>
        reject(new Error('ggwave 라이브러리 로드 실패. 네트워크 확인.'));
      document.head.appendChild(s);
    });
  }

  if (!ggwave) {
    ggwave = await window.ggwave_factory();
  }

  if (instance === null || lastSampleRate !== sampleRate) {
    const params = ggwave.getDefaultParameters();
    params.sampleRateInp = sampleRate;
    params.sampleRateOut = sampleRate;
    instance = ggwave.init(params);
    lastSampleRate = sampleRate;
  }
}

/**
 * Float32Array 바이트를 Int8Array로 reinterpret (ggwave decode 입력 형식).
 */
function convertTypedArray(src, type) {
  const buf = new ArrayBuffer(src.byteLength);
  new src.constructor(buf).set(src);
  return new type(buf);
}

// =============== Encoding helpers ===============

/**
 * 와이파이 정보를 컴팩트 오디오 페이로드로 인코딩.
 * 매직 prefix 'WS'로 시작 + 탭 구분.
 */
export function encodeWifiPayload({ ssid, password = '', security = 'WPA', label = '' }) {
  const parts = ['WS', ssid, password, security];
  if (label) parts.push(label);
  return parts.join('\t');
}

/**
 * 받은 오디오 메시지가 우리 와이파이 페이로드인지 파싱.
 * 아니면 null.
 */
export function parseWifiPayload(message) {
  if (!message || !message.startsWith('WS\t')) return null;
  const parts = message.split('\t');
  if (parts.length < 4) return null;
  return {
    ssid: parts[1],
    password: parts[2],
    security: parts[3] || 'WPA',
    label: parts[4] || null,
  };
}

// =============== Transmit (송신) ===============

/**
 * 메시지를 오디오로 재생. Promise는 재생 끝나면 resolve.
 * onProgress: 진행률 0..1
 */
export async function transmit(message, { onProgress } = {}) {
  const SAMPLE_RATE = 48000;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: SAMPLE_RATE,
  });

  try {
    await loadGgwave(audioCtx.sampleRate);

    const waveform = ggwave.encode(
      instance,
      message,
      ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,
      15 // volume (1-100)
    );

    const buf = convertTypedArray(waveform, Float32Array);
    const buffer = audioCtx.createBuffer(1, buf.length, audioCtx.sampleRate);
    buffer.getChannelData(0).set(buf);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const durationSec = buf.length / audioCtx.sampleRate;

    return new Promise((resolve, reject) => {
      let progressTimer = null;
      const startedAt = performance.now();

      source.onended = () => {
        if (progressTimer) clearInterval(progressTimer);
        audioCtx.close().catch(() => {});
        if (onProgress) onProgress(1);
        resolve({ durationSec });
      };

      try {
        source.start(0);
      } catch (e) {
        if (progressTimer) clearInterval(progressTimer);
        audioCtx.close().catch(() => {});
        reject(e);
        return;
      }

      if (onProgress) {
        progressTimer = setInterval(() => {
          const elapsed = (performance.now() - startedAt) / 1000;
          const p = Math.min(0.99, elapsed / durationSec);
          onProgress(p);
        }, 100);
      }
    });
  } catch (e) {
    try {
      audioCtx.close();
    } catch {}
    throw e;
  }
}

// =============== Receive (수신) ===============

let receiver = null;

/**
 * 마이크 캡처 시작 + 디코드 시도.
 * onMessage(text): 디코드된 텍스트
 * onLevel(0..1): 입력 레벨 (시각화용)
 * onError(err): 디코드 중 에러
 */
export async function startReceiving({ onMessage, onLevel, onError }) {
  if (receiver) throw new Error('이미 수신 중입니다.');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });
  } catch (e) {
    throw new Error(
      e.name === 'NotAllowedError'
        ? '마이크 권한이 거부되었습니다. 주소창 마이크 아이콘에서 허용해주세요.'
        : '마이크 접근 실패: ' + e.message
    );
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  try {
    await loadGgwave(audioCtx.sampleRate);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
    throw e;
  }

  const mediaSource = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(1024, 1, 1);

  mediaSource.connect(processor);
  processor.connect(audioCtx.destination);

  receiver = { audioCtx, stream, processor, mediaSource };

  let lastMessage = null;
  let lastMessageAt = 0;

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);

    // 레벨 (RMS-ish 간이)
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += Math.abs(inputData[i]);
      }
      onLevel(sum / inputData.length);
    }

    // 디코드 시도
    try {
      const int8 = convertTypedArray(new Float32Array(inputData), Int8Array);
      const result = ggwave.decode(instance, int8);
      if (result && result.length > 0) {
        const text = new TextDecoder('utf-8').decode(result);
        // 같은 메시지가 연속 들어오는 경우 1초 내 중복 방지
        const now = performance.now();
        if (text !== lastMessage || now - lastMessageAt > 1000) {
          lastMessage = text;
          lastMessageAt = now;
          if (onMessage) onMessage(text);
        }
      }
    } catch (err) {
      if (onError) onError(err);
    }
  };
}

export function stopReceiving() {
  if (!receiver) return;
  try {
    receiver.processor.disconnect();
    receiver.mediaSource.disconnect();
    receiver.stream.getTracks().forEach((t) => t.stop());
    receiver.audioCtx.close().catch(() => {});
  } catch {
    /* ignore */
  }
  receiver = null;
}

export function isReceiving() {
  return !!receiver;
}
