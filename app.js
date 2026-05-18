// app.js v0.2
// 진입점: 카메라 / 업로드 / 위치 기반 자동 복원 / PWA 설치

import { extractWifi } from './lib/claude.js';
import {
  wifiQRString,
  macosCommand,
  linuxCommand,
  windowsCommand,
} from './lib/wifi.js';
import { storage } from './lib/storage.js';
import {
  getCurrentPosition,
  findNearby,
  formatDistance,
} from './lib/location.js';

// ============ helpers ============
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

const CONF_LABEL = { high: '높음', medium: '중간', low: '낮음' };

let cameraStream = null;
let installPromptEvent = null;
let currentResultTs = null; // 현재 화면에 떠 있는 결과의 history ts

// ============ navigation ============
function showView(name) {
  document.querySelectorAll('section[data-view]').forEach((v) => {
    v.hidden = v.dataset.view !== name;
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ============ camera ============
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    });
    $('video').srcObject = cameraStream;
    $('camera-section').hidden = false;
    $('camera-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    alert(
      '카메라 접근 실패: ' +
        e.message +
        '\n파일 업로드를 사용하거나, HTTPS 환경에서 다시 시도해주세요.'
    );
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  $('video').srcObject = null;
}

function captureFrame() {
  const v = $('video');
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext('2d').drawImage(v, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.88);
}

// ============ processing ============
async function processImage(dataUrl) {
  const apiKey = storage.getApiKey();
  if (!apiKey) {
    alert('먼저 설정에서 Anthropic API 키를 등록하세요.');
    showView('settings');
    return;
  }

  $('result-loading').hidden = false;
  $('result-data').hidden = true;
  $('result-error').hidden = true;
  showView('result');

  const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!m) {
    showError('이미지 형식 오류');
    return;
  }
  const [, mediaType, base64] = m;

  // 위치는 추출과 병렬로 (실패해도 추출은 계속)
  const locationPromise = storage.isLocationEnabled()
    ? getCurrentPosition().catch(() => null)
    : Promise.resolve(null);

  try {
    const result = await extractWifi({
      apiKey,
      model: storage.getModel(),
      base64,
      mediaType,
    });
    if (!result.ssid) {
      throw new Error(
        '이미지에서 SSID를 찾지 못했습니다. 더 선명한 사진으로 다시 시도해주세요.'
      );
    }

    const location = await locationPromise;
    const saved = storage.addHistory({
      ssid: result.ssid,
      password: result.password,
      security: result.security,
      location,
    });
    currentResultTs = saved.ts;

    renderResult({ ...result, location: saved.location, label: saved.label });
  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
  $('result-loading').hidden = true;
  $('result-data').hidden = true;
  $('result-error').hidden = false;
  $('result-error-msg').textContent = msg;
}

function renderResult(r) {
  $('result-loading').hidden = true;
  $('result-data').hidden = false;

  $('out-ssid').textContent = r.ssid;
  $('out-pass').textContent = r.password || '(비밀번호 없음)';
  $('out-conf').textContent = CONF_LABEL[r.confidence] || r.confidence;
  $('out-notes').textContent = r.notes ? `· ${r.notes}` : '';

  const locEl = $('out-location');
  if (r.location) {
    locEl.textContent = `· 위치 저장됨`;
    locEl.hidden = false;
  } else {
    locEl.hidden = true;
  }

  // 라벨 입력 초기화
  $('label-input').value = r.label || '';
  $('label-saved').hidden = true;

  // QR
  const qrStr = wifiQRString(r);
  const qrEl = $('qr-canvas');
  qrEl.innerHTML = '';
  // eslint-disable-next-line no-undef, no-new
  new QRCode(qrEl, {
    text: qrStr,
    width: 200,
    height: 200,
    colorDark: '#1a1a1a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });

  // Commands
  const iface = storage.getIface();
  $('cmd-macos').textContent = macosCommand({ ...r, iface });
  $('cmd-linux').textContent = linuxCommand(r);
  $('cmd-windows').textContent = windowsCommand(r);
}

// ============ nearby (location-based recall) ============
async function refreshNearby() {
  const section = $('nearby-section');
  const list = $('nearby-list');

  if (!storage.isLocationEnabled()) {
    section.hidden = true;
    return;
  }

  const history = storage.getHistory();
  const withLoc = history.filter((e) => e.location);
  if (withLoc.length === 0) {
    section.hidden = true;
    return;
  }

  try {
    const pos = await getCurrentPosition({ timeout: 5000, maxAge: 60000 });
    const nearby = findNearby(pos, withLoc, 100); // 100m 이내

    if (nearby.length === 0) {
      section.hidden = true;
      return;
    }

    list.innerHTML = nearby
      .slice(0, 3)
      .map(
        ({ entry, dist }) => `
      <button class="nearby-item" data-action="reuse-nearby" data-ts="${entry.ts}">
        <div class="nearby-info">
          <div class="nearby-name">${escapeHtml(entry.label || entry.ssid)}</div>
          <div class="nearby-sub">
            ${entry.label ? `<span class="mono">${escapeHtml(entry.ssid)}</span> · ` : ''}
            <span>${formatDistance(dist)}</span>
          </div>
        </div>
        <span class="nearby-arrow">→</span>
      </button>
    `
      )
      .join('');
    section.hidden = false;
  } catch (e) {
    // 위치 실패 시 조용히 숨김 (홈 화면 깔끔하게)
    section.hidden = true;
  }
}

// ============ history ============
function renderHistory() {
  const list = storage.getHistory();
  const wrap = $('history-list');
  const clearBtn = $('btn-clear-history');

  if (list.length === 0) {
    wrap.innerHTML =
      '<p class="muted small" style="padding:1.5rem 0;">아직 저장된 항목이 없습니다.</p>';
    clearBtn.hidden = true;
    return;
  }
  clearBtn.hidden = false;

  wrap.innerHTML = list
    .map(
      (e) => `
    <div class="history-item">
      <div class="h-info">
        ${
          e.label
            ? `<div class="h-label">${escapeHtml(e.label)}</div>`
            : ''
        }
        <div class="h-ssid">${escapeHtml(e.ssid)}</div>
        <div class="h-pass">${escapeHtml(e.password || '(없음)')}</div>
        <div class="h-meta">
          ${new Date(e.ts).toLocaleString('ko-KR')}
          ${e.location ? '<span class="h-loc-pin">📍</span>' : ''}
        </div>
      </div>
      <div class="h-actions">
        <button data-action="copy-pass" data-ts="${e.ts}">PW 복사</button>
        <button data-action="reuse" data-ts="${e.ts}">QR 보기</button>
        <button data-action="delete" data-ts="${e.ts}">삭제</button>
      </div>
    </div>
  `
    )
    .join('');
}

function reuseEntry(ts) {
  const item = storage.getHistory().find((x) => x.ts === ts);
  if (!item) return;
  currentResultTs = ts;
  renderResult({
    ssid: item.ssid,
    password: item.password,
    security: item.security,
    confidence: 'high',
    notes: '기록에서 복원',
    location: item.location,
    label: item.label,
  });
  showView('result');
}

// ============ PWA install ============
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    const btn = $('btn-install');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      if (!installPromptEvent) return;
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        btn.hidden = true;
        $('install-hint').textContent = '설치되었습니다.';
      }
      installPromptEvent = null;
    });
  });

  window.addEventListener('appinstalled', () => {
    $('btn-install').hidden = true;
    $('install-hint').textContent = '설치되었습니다.';
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// 또는 비-HTTPS에서는 SW 등록 실패하므로 무시
  navigator.serviceWorker
    .register('sw.js')
    .catch((err) => console.warn('SW 등록 실패:', err.message));
}

// ============ init ============
function init() {
  // ----- nav -----
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.addEventListener('click', () => {
      const target = b.dataset.nav;
      if (target === 'history') renderHistory();
      if (target === 'home') refreshNearby();
      showView(target);
      stopCamera();
      $('camera-section').hidden = true;
    });
  });

  // ----- camera -----
  $('btn-camera').addEventListener('click', startCamera);
  $('btn-capture').addEventListener('click', async () => {
    const d = captureFrame();
    stopCamera();
    $('camera-section').hidden = true;
    await processImage(d);
  });
  $('btn-cancel-camera').addEventListener('click', () => {
    stopCamera();
    $('camera-section').hidden = true;
  });

  // ----- file upload -----
  $('file-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => processImage(reader.result);
    reader.onerror = () => alert('파일 읽기 실패');
    reader.readAsDataURL(f);
    e.target.value = '';
  });

  // ----- nearby refresh -----
  $('btn-refresh-nearby').addEventListener('click', refreshNearby);

  // ----- label input (Enter to save) -----
  $('label-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentResultTs) {
      const v = e.target.value.trim();
      storage.updateHistory(currentResultTs, { label: v || null });
      $('label-saved').hidden = false;
      setTimeout(() => ($('label-saved').hidden = true), 1500);
    }
  });

  // ----- settings: API key -----
  $('api-key-input').value = storage.getApiKey();
  $('btn-save-key').addEventListener('click', () => {
    const v = $('api-key-input').value.trim();
    storage.setApiKey(v);
    $('key-saved').hidden = false;
    setTimeout(() => ($('key-saved').hidden = true), 1500);
  });
  $('btn-clear-key').addEventListener('click', () => {
    if (confirm('API 키를 삭제할까요?')) {
      storage.clearApiKey();
      $('api-key-input').value = '';
    }
  });

  // ----- settings: model -----
  $('model-select').value = storage.getModel();
  $('model-select').addEventListener('change', (e) => {
    storage.setModel(e.target.value);
  });

  // ----- settings: location toggle -----
  $('loc-toggle').checked = storage.isLocationEnabled();
  $('loc-toggle').addEventListener('change', async (e) => {
    if (e.target.checked) {
      // 토글 켤 때 권한 미리 요청 (UX: 카페에서 처음 켤 때 권한 알람 안 뜨고 부드럽게)
      try {
        await getCurrentPosition({ timeout: 5000 });
        storage.setLocationEnabled(true);
      } catch (err) {
        alert(
          '위치 권한이 거부됐거나 가져오지 못했습니다: ' +
            err.message +
            '\n브라우저 설정에서 위치 권한을 허용해주세요.'
        );
        e.target.checked = false;
        storage.setLocationEnabled(false);
      }
    } else {
      storage.setLocationEnabled(false);
    }
  });

  // ----- settings: iface -----
  $('iface-input').value = storage.getIface();
  $('iface-input').addEventListener('change', (e) => {
    storage.setIface(e.target.value.trim());
  });

  // ----- copy buttons (delegated) -----
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-copy], [data-action]');
    if (!t) return;

    if (t.dataset.copy) {
      const target = $(t.dataset.copy);
      navigator.clipboard.writeText(target.textContent);
      const old = t.textContent;
      t.textContent = '복사됨';
      setTimeout(() => (t.textContent = old), 1200);
      return;
    }

    const action = t.dataset.action;
    const ts = +t.dataset.ts;

    if (action === 'copy-pass') {
      const item = storage.getHistory().find((x) => x.ts === ts);
      if (item) {
        navigator.clipboard.writeText(item.password);
        const old = t.textContent;
        t.textContent = '복사됨';
        setTimeout(() => (t.textContent = old), 1200);
      }
    } else if (action === 'delete') {
      storage.removeHistory(ts);
      renderHistory();
    } else if (action === 'reuse' || action === 'reuse-nearby') {
      reuseEntry(ts);
    }
  });

  // ----- clear history -----
  $('btn-clear-history').addEventListener('click', () => {
    if (confirm('전체 기록을 삭제할까요?')) {
      storage.clearHistory();
      renderHistory();
    }
  });

  renderHistory();
  showView('home');
  refreshNearby();
  setupInstallPrompt();
  registerServiceWorker();

  // ----- first-run nudge -----
  if (!storage.getApiKey()) {
    setTimeout(() => {
      if (
        confirm(
          'Anthropic API 키가 설정되지 않았습니다. 지금 설정으로 이동할까요?'
        )
      ) {
        showView('settings');
      }
    }, 400);
  }
}

document.addEventListener('DOMContentLoaded', init);
