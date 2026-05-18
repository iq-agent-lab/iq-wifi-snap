// lib/storage.js
// localStorage wrapper (settings + history)

const KEYS = {
  API: 'iq-wifi-snap:api-key',
  MODEL: 'iq-wifi-snap:model',
  IFACE: 'iq-wifi-snap:iface',
  HISTORY: 'iq-wifi-snap:history',
  LOC_ENABLED: 'iq-wifi-snap:location-enabled',
  KAKAO_KEY: 'iq-wifi-snap:kakao-key',
  OCR_ENABLED: 'iq-wifi-snap:ocr-enabled',
};

const HISTORY_CAP = 50;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_IFACE = 'en0';

export const storage = {
  // ---- API key ----
  getApiKey: () => localStorage.getItem(KEYS.API) || '',
  setApiKey: (k) => localStorage.setItem(KEYS.API, k),
  clearApiKey: () => localStorage.removeItem(KEYS.API),

  // ---- model ----
  getModel: () => localStorage.getItem(KEYS.MODEL) || DEFAULT_MODEL,
  setModel: (m) => localStorage.setItem(KEYS.MODEL, m),

  // ---- macOS interface ----
  getIface: () => localStorage.getItem(KEYS.IFACE) || DEFAULT_IFACE,
  setIface: (i) => localStorage.setItem(KEYS.IFACE, i || DEFAULT_IFACE),

  // ---- location preference ----
  isLocationEnabled: () => localStorage.getItem(KEYS.LOC_ENABLED) === '1',
  setLocationEnabled: (b) =>
    localStorage.setItem(KEYS.LOC_ENABLED, b ? '1' : '0'),

  // ---- kakao app key ----
  getKakaoKey: () => localStorage.getItem(KEYS.KAKAO_KEY) || '',
  setKakaoKey: (k) => localStorage.setItem(KEYS.KAKAO_KEY, k),
  clearKakaoKey: () => localStorage.removeItem(KEYS.KAKAO_KEY),

  // ---- offline OCR ----
  isOcrEnabled: () => localStorage.getItem(KEYS.OCR_ENABLED) === '1',
  setOcrEnabled: (b) => localStorage.setItem(KEYS.OCR_ENABLED, b ? '1' : '0'),

  // ---- history ----
  getHistory: () => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]');
    } catch {
      return [];
    }
  },

  /**
   * Add or upsert history entry by SSID.
   * 같은 SSID 재추출 시 기존 위치/라벨을 유지 (사용자가 라벨 단 걸 사진 한 번에 날리지 않도록).
   */
  addHistory: (entry) => {
    const arr = storage.getHistory();
    const existing = arr.find((e) => e.ssid === entry.ssid);
    const merged = {
      ssid: entry.ssid,
      password: entry.password,
      security: entry.security || 'WPA',
      location: existing?.location || entry.location || null,
      label: existing?.label || entry.label || null,
      createdAt: existing?.createdAt || Date.now(),
      ts: Date.now(),
    };
    const filtered = arr.filter((e) => e.ssid !== entry.ssid);
    filtered.unshift(merged);
    localStorage.setItem(
      KEYS.HISTORY,
      JSON.stringify(filtered.slice(0, HISTORY_CAP))
    );
    return merged;
  },

  /**
   * 특정 항목 부분 업데이트 (라벨 추가 등)
   */
  updateHistory: (ts, patch) => {
    const arr = storage.getHistory();
    const idx = arr.findIndex((e) => e.ts === ts);
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...patch };
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(arr));
    return arr[idx];
  },

  removeHistory: (ts) => {
    const arr = storage.getHistory().filter((e) => e.ts !== ts);
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(arr));
  },
  clearHistory: () => localStorage.removeItem(KEYS.HISTORY),
};
