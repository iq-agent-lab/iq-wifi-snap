// lib/parser.js
// OCR raw text → {ssid, password, security, confidence, notes}
// Claude Vision 응답 스키마와 동일한 형식으로 반환.

// 라벨 (긴/구체적인 것 우선 — '네트워크명'이 '네트워크'보다 먼저 매칭되도록)
const SSID_LABELS = [
  'wi-fi', 'wi fi', 'network name', 'wifi network',
  '네트워크명', '네트워크 이름', '네트워크 명',
  '와이파이명', '와이파이 이름', '와이파이 명',
  '와이파이',
  'ssid', 'wifi', 'network', 'wlan',
  '네트워크',
  'id', '아이디', 'name', 'wifi id',
];

const PW_LABELS = [
  'password', 'passwd', 'wifi pw',
  '비밀번호', '패스워드',
  'pw', 'pass', 'key',
  '비번', '암호',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 한 라인이 라벨인지 확인.
 * - inline: "SSID: foo" 형식 (값까지 같이 잡음)
 * - standalone: "SSID" 형식 (다음 라인이 값)
 */
function matchLabel(line, labels) {
  const trimmed = line.trim();

  for (const label of labels) {
    // inline: "label: value" / "label : value" / "label：value" (전각 콜론)
    const inlineRegex = new RegExp(
      `^${escapeRegex(label)}\\s*[：:\\-=]\\s*(.+)$`,
      'i'
    );
    const m = trimmed.match(inlineRegex);
    if (m) {
      return { type: 'inline', label, value: m[1].trim() };
    }

    // standalone: "label" 또는 "label:" 만 있는 경우
    const standaloneRegex = new RegExp(
      `^${escapeRegex(label)}\\s*[：:\\-=]?\\s*$`,
      'i'
    );
    if (standaloneRegex.test(trimmed)) {
      return { type: 'standalone', label };
    }
  }
  return null;
}

/**
 * 값에서 흔한 OCR 부산물 제거:
 *  - 앞쪽 글머리 기호
 *  - 양 끝 공백
 *  - 끝의 마침표 (한 글자 점이면 OCR 오인일 가능성)
 */
function cleanValue(s) {
  if (!s) return '';
  return s
    .replace(/^[*•·\-•▶▸>]\s*/, '')
    .replace(/\s+$/, '')
    .trim();
}

/**
 * 라인이 라벨인지 검사한 뒤, 다음 비어있지 않은 라인을 값으로 가져옴.
 */
function nextNonEmpty(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim()) return { idx: i, value: lines[i].trim() };
  }
  return null;
}

/**
 * 라인이 다른 라벨인지 검사 (값으로 쓰면 안 되는 라인 제외용).
 */
function isAnyLabel(line) {
  return matchLabel(line, SSID_LABELS) || matchLabel(line, PW_LABELS);
}

/**
 * OCR 텍스트를 받아 SSID/PW 추출.
 */
export function parseFromText(rawText) {
  const lines = rawText.split('\n').map((l) => l.replace(/\u00a0/g, ' '));
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  let ssid = '';
  let password = '';
  const notes = [];

  for (let i = 0; i < nonEmpty.length; i++) {
    const line = nonEmpty[i];

    if (!ssid) {
      const m = matchLabel(line, SSID_LABELS);
      if (m) {
        if (m.type === 'inline') {
          ssid = m.value;
        } else {
          const next = nextNonEmpty(nonEmpty, i + 1);
          if (next && !isAnyLabel(next.value)) {
            ssid = next.value;
          }
        }
        continue;
      }
    }

    if (!password) {
      const m = matchLabel(line, PW_LABELS);
      if (m) {
        if (m.type === 'inline') {
          password = m.value;
        } else {
          const next = nextNonEmpty(nonEmpty, i + 1);
          if (next && !isAnyLabel(next.value)) {
            password = next.value;
          }
        }
        continue;
      }
    }
  }

  ssid = cleanValue(ssid);
  password = cleanValue(password);

  // 신뢰도 결정
  let confidence;
  if (ssid && password) confidence = 'high';
  else if (ssid || password) confidence = 'medium';
  else confidence = 'low';

  // 너무 짧거나 너무 긴 값은 의심
  if (ssid && (ssid.length < 2 || ssid.length > 64)) {
    confidence = 'low';
    notes.push('SSID 길이가 비정상적');
  }
  if (password && password.length > 128) {
    confidence = 'low';
    notes.push('비밀번호가 너무 김');
  }

  if (!ssid) notes.push('SSID 라벨을 찾지 못했습니다');
  if (!password) notes.push('비밀번호 라벨을 찾지 못했습니다');

  return {
    ssid,
    password,
    security: password ? 'WPA' : 'nopass',
    confidence,
    notes: notes.join(', '),
  };
}
