// app.js v0.4
// 진입점: 카메라 권한 정교화 / 커스텀 confirm / PWA 설치 분기 / 브랜드 갱신

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
import { shareToKakao, looksLikeKakaoKey } from './lib/kakao.js';

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
let currentResultTs = null;
let currentResult = null;

// ============ env detection ============
const env = {
  isIOS:
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
  isAndroid: /Android/.test(navigator.userAgent),
  isStandalone:
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true,
};

// ============ navigation ============
function showView(name) {
  document.querySelectorAll('section[data-view]').forEach((v) => {
    v.hidden = v.dataset.view !== name;
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ============ custom confirm modal ============
function confirmModal({ title, message, okText = '삭제', cancelText = '취소' }) {
  return new Promise((resolve) => {
    const modal = $('confirm-modal');
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message || '';
    $('confirm-ok').textContent = okText;
    $('confirm-cancel').textContent = cancelText;

    const cleanup = () => {
      modal.hidden = true;
      $('confirm-ok').removeEventListener('click', onOk);
      $('confirm-cancel').removeEventListener('click', onCancel);
      modal.querySelector('.modal-backdrop').removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onOk();
    };

    $('confirm-ok').addEventListener('click', onOk);
    $('confirm-cancel').addEventListener('click', onCancel);
    modal.querySelector('.modal-backdrop').addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);

    modal.hidden = false;
    setTimeout(() => $('confirm-cancel').focus(), 50);
  });
}

// ============ camera ============
async function getCameraPermission() {
  if (!navigator.permissions || !navigator.permissions.query) {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'camera' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unsupported';
  }
}

async function startCamera() {
  const perm = await getCameraPermission();
  if (perm === 'denied') {
    alert(
      '카메라 권한이 차단되어 있습니다.\n\n' +
        '주소창 왼쪽의 사이트 정보 아이콘 또는 브라우저 설정에서 ' +
        '이 사이트의 카메라 권한을 "허용"으로 바꿔주세요.\n\n' +
        '그동안은 "파일 업로드" 버튼을 사용하실 수 있습니다.'
    );
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    });
    $('video').srcObject = cameraStream;
    $('camera-section').hidden = false;
    $('camera-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 권한 상태 변경 감지: 설정 화면 가서 다시 들어왔을 때 반영
    updateCameraStatus();
  } catch (e) {
    let msg = '카메라 접근 실패: ' + e.message;
    if (e.name === 'NotAllowedError') {
      msg =
        '카메라 권한이 거부되었습니다.\n' +
        '주소창의 카메라 아이콘에서 권한을 "허용"으로 바꿔주세요.';
    } else if (e.name === 'NotFoundError') {
      msg = '이 기기에서 카메라를 찾을 수 없습니다.';
    } else if (e.name === 'NotReadableError') {
      msg = '다른 앱이 카메라를 사용 중입니다. 해당 앱을 닫고 다시 시도해주세요.';
    }
    alert(msg + '\n\n파일 업로드를 사용하실 수 있습니다.');
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

async function updateCameraStatus() {
  const el = $('camera-status');
  if (!el) return;
  const perm = await getCameraPermission();
  el.classList.remove('granted', 'denied', 'prompt');
  if (perm === 'granted') {
    el.classList.add('granted');
    el.textContent = '✓ 카메라 권한이 허용되어 있습니다. 매번 묻지 않습니다.';
  } else if (perm === 'denied') {
    el.classList.add('denied');
    el.textContent =
      '✗ 카메라 권한이 차단되어 있습니다. 주소창 카메라 아이콘에서 "허용"으로 변경하세요.';
  } else if (perm === 'prompt') {
    el.classList.add('prompt');
    el.textContent =
      '⚠ 아직 권한이 결정되지 않았습니다. 카메라를 처음 열 때 한 번 "허용"을 선택하시면 이후엔 묻지 않습니다.';
  } else {
    el.textContent =
      '이 브라우저는 권한 상태 확인을 지원하지 않습니다 (Safari 등). 처음 카메라 열 때 권한을 허용해주세요.';
  }
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

  $('label-input').value = r.label || '';
  $('label-input').disabled = !!r._shared;
  $('label-input').placeholder = r._shared
    ? '공유받은 정보는 저장되지 않음'
    : '카페 이름 (선택, Enter로 저장)';
  $('label-saved').hidden = true;

  $('btn-regen-qr').hidden = true;

  updateKakaoButtonVisibility();
  renderQRAndCommands(r);
}

function renderQRAndCommands(r) {
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

  const iface = storage.getIface();
  $('cmd-macos').textContent = macosCommand({ ...r, iface });
  $('cmd-linux').textContent = linuxCommand(r);
  $('cmd-windows').textContent = windowsCommand(r);
}

// ============ inline edit ============
function setupEditableFields() {
  const onEdit = () => {
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
    currentResult = { ...currentResult, ssid: newSsid, password: newPass };
    renderQRAndCommands(currentResult);
    if (currentResultTs) {
      storage.updateHistory(currentResultTs, {
        ssid: newSsid,
        password: newPass,
      });
    }
    $('btn-regen-qr').hidden = true;
    flashFeedback('갱신됨');
  });
}

function flashFeedback(text) {
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
    flashFeedback('공유됨');
  } else if (res.method === 'clipboard') {
    flashFeedback('이 환경은 시스템 공유 시트를 지원하지 않습니다. 링크를 클립보드에 복사했어요. (폰에서는 카톡/인스타 시트가 직접 뜹니다)');
  } else if (res.method === 'cancel') {
    /* silent */
  } else {
    alert('공유에 실패했습니다.');
  }
}

async function handleShareKakao() {
  if (!currentResult) return;
  const jsKey = storage.getKakaoKey();
  if (!jsKey) {
    alert('설정에서 Kakao JS 앱 키를 먼저 등록하세요.');
    showView('settings');
    return;
  }

  const url = createShareUrl(currentResult);
  const title = currentResult.label
    ? `${currentResult.label} 와이파이`
    : '와이파이 정보 도착';
  const description = currentResult.password
    ? `SSID: ${currentResult.ssid}\n비밀번호: ${currentResult.password}\n\n탭하면 QR이 떠요.`
    : `SSID: ${currentResult.ssid}\n\n탭하면 QR이 떠요.`;
  // GitHub Pages 절대 경로 (Kakao는 imageUrl에 절대 URL 필요)
  const imageUrl = new URL('icons/icon-512.png', window.location.href).toString();

  try {
    await shareToKakao({
      jsKey,
      title,
      description,
      url,
      imageUrl,
      buttonLabel: '와이파이 접속하기',
    });
    flashFeedback('카톡 공유창을 열었습니다');
  } catch (e) {
    let msg = e.message;
    if (/invalid|domain|app key/i.test(msg)) {
      msg +=
        '\n\nKakao Developers에서 이 사이트 도메인을 플랫폼 → Web에 등록했는지 확인해주세요.';
    }
    alert('카톡 공유 실패: ' + msg);
  }
}

function updateKakaoButtonVisibility() {
  const has = !!storage.getKakaoKey();
  const btn = document.getElementById('btn-share-kakao');
  if (btn) btn.hidden = !has;
}

async function handleCopyShareLink() {
  if (!currentResult) return;
  const url = createShareUrl(currentResult);
  try {
    await navigator.clipboard.writeText(url);
    flashFeedback('공유 링크 복사됨');
  } catch {
    prompt('아래 링크를 복사하세요:', url);
  }
}

function handleDownloadQR() {
  if (!currentResult) return;
  try {
    const safeSsid = currentResult.ssid.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    downloadQR($('qr-canvas'), `wifi-${safeSsid}.png`);
    flashFeedback('저장됨');
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

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('wifi');
  window.history.replaceState({}, '', cleanUrl.toString());

  currentResultTs = null;
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

// ============ PWA install (revamped) ============
function setupInstallExperience() {
  const btn = $('btn-install');
  const status = $('install-status');
  const guide = $('install-guide');

  // 이미 standalone으로 실행 중?
  if (env.isStandalone) {
    btn.hidden = true;
    status.hidden = false;
    status.classList.add('installed');
    status.textContent = '✓ 이미 홈 화면에 설치되어 실행 중입니다.';
    guide.innerHTML = '';
    return;
  }

  // iOS Safari: beforeinstallprompt 미지원 → 가이드 직접 표시
  if (env.isIOS) {
    btn.hidden = true;
    guide.innerHTML = `
      <p><strong>iOS는 자동 설치 버튼이 동작하지 않습니다.</strong> 아래 단계로 직접 추가해주세요:</p>
      <ol>
        <li>Safari 하단의 <kbd>공유</kbd> 버튼 탭</li>
        <li>메뉴를 스크롤해서 <kbd>홈 화면에 추가</kbd> 선택</li>
        <li>우측 상단 <kbd>추가</kbd> 탭</li>
      </ol>
      <p class="small muted">앱처럼 동작하고 카메라/위치 권한도 더 안정적으로 유지됩니다.</p>
    `;
    return;
  }

  // Android Chrome / Edge / Desktop Chrome: beforeinstallprompt 대기
  guide.innerHTML = env.isAndroid
    ? '<p class="small">아래 버튼이 안 보이면 Chrome 메뉴 <kbd>⋮</kbd> → <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 사용하세요.</p>'
    : '<p class="small">아래 버튼이 안 보이면 주소창 오른쪽의 설치 아이콘 또는 메뉴 <kbd>⋮</kbd> → <strong>앱 설치</strong>를 사용하세요.</p>';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!installPromptEvent) {
      alert(
        '설치 다이얼로그가 이미 한 번 표시되었거나 만료되었습니다.\n' +
          '브라우저 메뉴(⋮)에서 "앱 설치" 또는 "홈 화면에 추가"를 직접 선택해주세요.'
      );
      return;
    }
    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    installPromptEvent = null;
    if (choice.outcome === 'accepted') {
      btn.hidden = true;
      status.hidden = false;
      status.classList.add('installed');
      status.textContent = '✓ 설치되었습니다. 홈 화면에서 실행하세요.';
    } else {
      // 사용자가 거부 - 안내 메시지로 직접 설치 방법 표시
      btn.hidden = true;
      guide.innerHTML =
        '<p class="small">설치를 취소하셨습니다. 나중에 설치하려면 브라우저 메뉴 <kbd>⋮</kbd> → <strong>앱 설치</strong>를 이용하세요.</p>';
    }
  });

  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    status.hidden = false;
    status.classList.add('installed');
    status.textContent = '✓ 설치되었습니다.';
    installPromptEvent = null;
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
      if (target === 'settings') updateCameraStatus();
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
  $('btn-share-kakao').addEventListener('click', handleShareKakao);
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
  $('btn-clear-key').addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'API 키 삭제',
      message: '저장된 Anthropic API 키를 삭제할까요? 이후 추출 기능을 사용하려면 다시 입력해야 합니다.',
      okText: '삭제',
    });
    if (ok) {
      storage.clearApiKey();
      $('api-key-input').value = '';
    }
  });

  // ----- settings: model -----
  $('model-select').value = storage.getModel();
  $('model-select').addEventListener('change', (e) => {
    storage.setModel(e.target.value);
  });

  // ----- settings: kakao key -----
  $('kakao-key-input').value = storage.getKakaoKey();
  $('btn-save-kakao').addEventListener('click', () => {
    const v = $('kakao-key-input').value.trim();
    if (v && !looksLikeKakaoKey(v)) {
      if (
        !confirm(
          'Kakao JS 앱 키는 보통 32자 영숫자입니다. 입력하신 값이 형식과 달라 보이는데 그래도 저장할까요?'
        )
      ) {
        return;
      }
    }
    storage.setKakaoKey(v);
    $('kakao-saved').hidden = false;
    setTimeout(() => ($('kakao-saved').hidden = true), 1500);
    updateKakaoButtonVisibility();
  });
  $('btn-clear-kakao').addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Kakao 앱 키 삭제',
      message: '저장된 Kakao JS 앱 키를 삭제할까요? 이후 카톡 공유 버튼이 사라지고, 시스템 공유 시트만 사용할 수 있습니다.',
      okText: '삭제',
    });
    if (ok) {
      storage.clearKakaoKey();
      $('kakao-key-input').value = '';
      updateKakaoButtonVisibility();
    }
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

  // ----- copy + delegated actions -----
  document.body.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-copy], [data-copy-value], [data-action]');
    if (!t) return;

    if (t.dataset.copy) {
      navigator.clipboard.writeText($(t.dataset.copy).textContent);
      const old = t.textContent;
      t.textContent = '복사됨';
      setTimeout(() => (t.textContent = old), 1200);
      return;
    }

    if (t.dataset.copyValue) {
      navigator.clipboard.writeText($(t.dataset.copyValue).value);
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
      const item = storage.getHistory().find((x) => x.ts === ts);
      if (!item) return;
      const label = item.label || item.ssid;
      const ok = await confirmModal({
        title: '기록 삭제',
        message: `"${label}" 항목을 삭제할까요? 위치 정보와 라벨도 함께 사라집니다.`,
        okText: '삭제',
      });
      if (ok) {
        storage.removeHistory(ts);
        renderHistory();
      }
    } else if (action === 'reuse' || action === 'reuse-nearby') {
      reuseEntry(ts);
    } else if (action === 'share-entry') {
      shareEntryFromHistory(ts);
    }
  });

  // ----- clear history -----
  $('btn-clear-history').addEventListener('click', async () => {
    const count = storage.getHistory().length;
    const ok = await confirmModal({
      title: '전체 기록 삭제',
      message: `저장된 ${count}개의 와이파이 기록을 모두 삭제할까요? 되돌릴 수 없습니다.`,
      okText: '전체 삭제',
    });
    if (ok) {
      storage.clearHistory();
      renderHistory();
    }
  });

  renderHistory();
  setupInstallExperience();
  updateCameraStatus();
  registerServiceWorker();

  // ----- 진입 시 공유 링크 처리 또는 홈 -----
  const imported = tryImportFromUrl();
  if (!imported) {
    showView('home');
    refreshNearby();

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
}

document.addEventListener('DOMContentLoaded', init);
