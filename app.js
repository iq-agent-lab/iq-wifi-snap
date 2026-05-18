// app.js
// Main app: camera, file upload, processing, result rendering, history

import { extractWifi } from './lib/claude.js';
import {
  wifiQRString,
  macosCommand,
  linuxCommand,
  windowsCommand,
} from './lib/wifi.js';
import { storage } from './lib/storage.js';

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
    renderResult(result);
    storage.addHistory({
      ssid: result.ssid,
      password: result.password,
      security: result.security,
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

  $('out-ssid').textContent = r.ssid;
  $('out-pass').textContent = r.password || '(비밀번호 없음)';
  $('out-conf').textContent = CONF_LABEL[r.confidence] || r.confidence;
  $('out-notes').textContent = r.notes ? `· ${r.notes}` : '';

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
      <div>
        <div class="h-ssid">${escapeHtml(e.ssid)}</div>
        <div class="h-pass">${escapeHtml(e.password || '(없음)')}</div>
        <div class="h-ts">${new Date(e.ts).toLocaleString('ko-KR')}</div>
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

// ============ init ============
function init() {
  // ----- nav -----
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.addEventListener('click', () => {
      const target = b.dataset.nav;
      if (target === 'history') renderHistory();
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
    // reset for re-selecting same file
    e.target.value = '';
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

  // ----- settings: iface -----
  $('iface-input').value = storage.getIface();
  $('iface-input').addEventListener('change', (e) => {
    storage.setIface(e.target.value.trim());
  });

  // ----- copy buttons (delegated) -----
  document.body.addEventListener('click', (e) => {
    const t = e.target;

    if (t.matches('[data-copy]')) {
      const target = $(t.dataset.copy);
      navigator.clipboard.writeText(target.textContent);
      const old = t.textContent;
      t.textContent = '복사됨';
      setTimeout(() => (t.textContent = old), 1200);
    }

    if (t.matches('[data-action="copy-pass"]')) {
      const ts = +t.dataset.ts;
      const item = storage.getHistory().find((x) => x.ts === ts);
      if (item) {
        navigator.clipboard.writeText(item.password);
        const old = t.textContent;
        t.textContent = '복사됨';
        setTimeout(() => (t.textContent = old), 1200);
      }
    }

    if (t.matches('[data-action="delete"]')) {
      storage.removeHistory(+t.dataset.ts);
      renderHistory();
    }

    if (t.matches('[data-action="reuse"]')) {
      const ts = +t.dataset.ts;
      const item = storage.getHistory().find((x) => x.ts === ts);
      if (item) {
        renderResult({
          ...item,
          confidence: 'high',
          notes: '기록에서 복원',
        });
        showView('result');
      }
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
