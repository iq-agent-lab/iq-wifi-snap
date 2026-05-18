// app.js v0.3
// 진입점: 카메라 / 업로드 / 위치 자동 복원 / 공유 링크 / 편집 / PWA

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
import {
  createShareUrl,
  parseShareUrl,
  shareViaSystem,
  downloadQR,
  buildShareText,
} from './lib/share.js';

// ============ helpers ============
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const CONF_LABEL = { high: '높음', medium: '중간', low: '낮음' };

let cameraStream = null;
let installPromptEvent = null;
let currentResultTs = null; // 현재 화면 결과의 history ts (공유받은 거면 null)
let currentResult = null; // 현재 화면에 표시 중인 데이터 (편집 상태 포함)

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
  $('shared-banner').hidden = true;
  showView('result');

  const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!m) {
    showError('이미지 형식 오류');
    return;
  }
  const [, mediaType, base64] = m;

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

    renderResult({
      ...result,
      location: saved.location,
      label: saved.label,
      _shared: false,
    });
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
  $('shared-banner').hidden = !r._shared;

  currentResult = { ...r };

  $('out-ssid').value = r.ssid;
  $('out-pass').value = r.password || '';

  // 공유받은 경우 신뢰도 라벨 숨김 (의미 없음)
  if (r._shared) {
    $('out-conf-wrap').hidden = true;
    $('out-notes').textContent = '';
  } else {
    $('out-conf-wrap').hidden = false;
    $('out-conf').textContent = CONF_LABEL[r.confidence] || r.confidence || '-';
    $('out-notes').textContent = r.notes ? `· ${r.notes}` : '';
  }

  const locEl = $('out-location');
  if (r.location) {
    locEl.textContent = `· 위치 저장됨`;
    locEl.hidden = false;
  } else {
    locEl.hidden = true;
  }

  // 라벨 (공유받은 경우는 보여만 주고 저장은 안 함)
  $('label-input').value = r.label || '';
  $('label-input').disabled = !!r._shared;
  $('label-input').placeholder = r._shared
    ? '공유받은 정보는 저장되지 않음'
    : '카페 이름 (선택, Enter로 저장)';
  $('label-saved').hidden = true;

  $('btn-regen-qr').hidden = true;

  renderQRAndCommands(r);
}

function renderQRAndCommands(r) {
  // QR
  const qrStr = wifiQRString({
    ssid: r.ssid,
    password: r.password,
    security: r.security,
  });
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

// ============ inline edit ============
function setupEditableFields() {
  const onEdit = () => {
    // 편집 감지 → QR 갱신 버튼 노출
    const ssid = $('out-ssid').value.trim();
    const pass = $('out-pass').value;
    if (
      currentResult &&
      (ssid !== currentResult.ssid || pass !== currentResult.password)
    ) {
      $('btn-regen-qr').hidden = false;
    } else {
      $('btn-regen-qr').hidden = true;
    }
  };
  $('out-ssid').addEventListener('input', onEdit);
  $('out-pass').addEventListener('input', onEdit);

  $('btn-regen-qr').addEventListener('click', () => {
    if (!currentResult) return;
    const newSsid = $('out-ssid').value.trim();
    const newPass = $('out-pass').value;
    if (!newSsid) {
      alert('SSID는 비울 수 없습니다.');
      return;
    }
    currentResult = {
      ...currentResult,
      ssid: newSsid,
      password: newPass,
    };
    renderQRAndCommands(currentResult);
    // history도 업데이트 (공유받은 결과는 ts가 없으므로 안전)
    if (currentResultTs) {
      storage.updateHistory(currentResultTs, {
        ssid: newSsid,
        password: newPass,
      });
    }
    $('btn-regen-qr').hidden = true;
    flashSaved($('btn-regen-qr'), '갱신됨');
  });
}

function flashSaved(targetForFeedback, text = '됨') {
  // 간단 토스트 대용: 버튼 라벨 잠깐 변경
  const fb = $('share-feedback');
  fb.textContent = text;
  fb.hidden = false;
  setTimeout(() => (fb.hidden = true), 1500);
}

// ============ sharing ============
async function handleShare() {
  if (!currentResult) return;
  const url = createShareUrl(currentResult);
  const text = buildShareText(currentResult);
  const title = currentResult.label
    ? `${currentResult.label} 와이파이`
    : '와이파이 정보';

  const res = await shareViaSystem({ title, text, url });
  if (res.method === 'share') {
    flashSaved(null, '공유됨');
  } else if (res.method === 'clipboard') {
    flashSaved(null, '링크가 클립보드에 복사되었습니다');
  } else if (res.method === 'cancel') {
    /* 취소: 조용히 */
  } else {
    alert('공유에 실패했습니다.');
  }
}

async function handleCopyShareLink() {
  if (!currentResult) return;
  const url = createShareUrl(currentResult);
  try {
    await navigator.clipboard.writeText(url);
    flashSaved(null, '공유 링크 복사됨');
  } catch {
    // 폴백: prompt로 수동 복사
    prompt('아래 링크를 복사하세요:', url);
  }
}

function handleDownloadQR() {
  if (!currentResult) return;
  try {
    const safeSsid = currentResult.ssid.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    downloadQR($('qr-canvas'), `wifi-${safeSsid}.png`);
    flashSaved(null, '저장됨');
  } catch (e) {
    alert(e.message);
  }
}

// ============ nearby ============
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
    const nearby = findNearby(pos, withLoc, 100);

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
        ${e.label ? `<div class="h-label">${escapeHtml(e.label)}</div>` : ''}
        <div class="h-ssid">${escapeHtml(e.ssid)}</div>
        <div class="h-pass">${escapeHtml(e.password || '(없음)')}</div>
        <div class="h-meta">
          ${new Date(e.ts).toLocaleString('ko-KR')}
          ${e.location ? '<span class="h-loc-pin">📍</span>' : ''}
        </div>
      </div>
      <div class="h-actions">
        <button data-action="copy-pass" data-ts="${e.ts}">PW 복사</button>
        <button data-action="share-entry" data-ts="${e.ts}">공유</button>
        <button data-action="reuse" data-ts="${e.ts}">QR</button>
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
    _shared: false,
  });
  showView('result');
}

async function shareEntryFromHistory(ts) {
  const item = storage.getHistory().find((x) => x.ts === ts);
  if (!item) return;
  const payload = {
    ssid: item.ssid,
    password: item.password,
    security: item.security,
    label: item.label,
  };
  const url = createShareUrl(payload);
  const text = buildShareText(payload);
  const title = item.label ? `${item.label} 와이파이` : '와이파이 정보';
  await shareViaSystem({ title, text, url });
}

// ============ deep link import ============
function tryImportFromUrl() {
  const imported = parseShareUrl(window.location.search);
  if (!imported) return false;

  // URL에서 wifi 파라미터 제거 (뒤로가기/새로고침 시 다시 임포트되는 거 방지)
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('wifi');
  window.history.replaceState({}, '', cleanUrl.toString());

  currentResultTs = null; // 공유받은 데이터는 자동 저장 안 함
  renderResult({
    ssid: imported.ssid,
    password: imported.password,
    security: imported.security,
    label: imported.label,
    confidence: 'high',
    notes: '',
    location: null,
    _shared: true,
  });
  showView('result');
  return true;
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

  // ----- nearby -----
  $('btn-refresh-nearby').addEventListener('click', refreshNearby);

  // ----- editable result fields -----
  setupEditableFields();

  // ----- share buttons -----
  $('btn-share').addEventListener('click', handleShare);
  $('btn-share-link').addEventListener('click', handleCopyShareLink);
  $('btn-download-qr').addEventListener('click', handleDownloadQR);

  // ----- label -----
  $('label-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentResultTs) {
      const v = e.target.value.trim();
      storage.updateHistory(currentResultTs, { label: v || null });
      currentResult.label = v || null;
      $('label-saved').hidden = false;
      setTimeout(() => ($('label-saved').hidden = true), 1500);
    }
  });

  // ----- settings: API key -----
  $('api-key-input').value = storage.getApiKey();
  $('btn-save-key').addEventListener('click', () => {
    storage.setApiKey($('api-key-input').value.trim());
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
      try {
        await getCurrentPosition({ timeout: 5000 });
        storage.setLocationEnabled(true);
      } catch (err) {
        alert('위치 권한이 거부됐거나 가져오지 못했습니다: ' + err.message);
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
    const t = e.target.closest('[data-copy], [data-copy-value], [data-action]');
    if (!t) return;

    // textContent 복사
    if (t.dataset.copy) {
      const target = $(t.dataset.copy);
      navigator.clipboard.writeText(target.textContent);
      const old = t.textContent;
      t.textContent = '복사됨';
      setTimeout(() => (t.textContent = old), 1200);
      return;
    }

    // input value 복사
    if (t.dataset.copyValue) {
      const target = $(t.dataset.copyValue);
      navigator.clipboard.writeText(target.value);
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
    } else if (action === 'share-entry') {
      shareEntryFromHistory(ts);
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
  setupInstallPrompt();
  registerServiceWorker();

  // ----- 진입 시 URL에 wifi 파라미터가 있으면 임포트, 아니면 홈 -----
  const imported = tryImportFromUrl();
  if (!imported) {
    showView('home');
    refreshNearby();

    if (!storage.getApiKey()) {
      setTimeout(() => {
        if (
          confirm('Anthropic API 키가 설정되지 않았습니다. 지금 설정으로 이동할까요?')
        ) {
          showView('settings');
        }
      }, 400);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
