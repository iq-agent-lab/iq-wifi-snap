// lib/storage.js
// localStorage wrapper (settings + history)

const KEYS = {
  API: 'iq-wifi-snap:api-key',
  MODEL: 'iq-wifi-snap:model',
  IFACE: 'iq-wifi-snap:iface',
  HISTORY: 'iq-wifi-snap:history',
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

  // ---- history ----
  getHistory: () => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]');
    } catch {
      return [];
    }
  },
  addHistory: (entry) => {
    const arr = storage.getHistory();
    // dedup by ssid (move existing to top, replace pw)
    const filtered = arr.filter((e) => e.ssid !== entry.ssid);
    filtered.unshift({ ...entry, ts: Date.now() });
    localStorage.setItem(
      KEYS.HISTORY,
      JSON.stringify(filtered.slice(0, HISTORY_CAP))
    );
  },
  removeHistory: (ts) => {
    const arr = storage.getHistory().filter((e) => e.ts !== ts);
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(arr));
  },
  clearHistory: () => localStorage.removeItem(KEYS.HISTORY),
};
