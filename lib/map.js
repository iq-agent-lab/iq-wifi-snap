// lib/map.js
// Leaflet + OpenStreetMap 동적 로딩 + 마커 렌더.
// 무료, API 키 불필요. 첫 사용 시점에만 로드(평소 페이로드 0).

const LEAFLET_VER = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
const LEAFLET_JS  = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;

let loaded = false;
let mapInstance = null;
let markersLayer = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function loadLeaflet() {
  if (loaded) return;

  // CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  document.head.appendChild(link);

  // JS
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('지도 라이브러리 로딩 실패. 네트워크 확인.'));
    document.head.appendChild(s);
  });

  loaded = true;
}

/**
 * containerId DOM 요소에 지도 렌더 + entries의 위치에 마커.
 * entries: history items (location이 있는 항목만 사용).
 *
 * @returns {markerCount: number}
 */
export async function renderMap(containerId, entries) {
  await loadLeaflet();
  const L = window.L;

  const container = document.getElementById(containerId);
  if (!container) throw new Error(`#${containerId} 요소가 없음`);

  // 첫 호출: 지도 인스턴스 생성
  if (!mapInstance) {
    mapInstance = L.map(container, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance);
    markersLayer = L.layerGroup().addTo(mapInstance);
  } else {
    // 컨테이너 위치 바뀌면 크기 재계산 필요
    setTimeout(() => mapInstance.invalidateSize(), 0);
  }

  // 마커 갱신
  markersLayer.clearLayers();
  const withLoc = entries.filter((e) => e.location && typeof e.location.lat === 'number');

  if (withLoc.length === 0) {
    return { markerCount: 0 };
  }

  const bounds = [];
  for (const e of withLoc) {
    const lat = e.location.lat;
    const lng = e.location.lng;
    bounds.push([lat, lng]);

    const name = e.label || e.ssid;
    let speedStr;
    if (e.speedMbps) {
      const color =
        e.speedMbps >= 50 ? '#2d7a3e' :
        e.speedMbps >= 20 ? '#3a7a5c' :
        e.speedMbps >= 5  ? '#b8860b' : '#b3361e';
      speedStr = `<strong style="color:${color}">${e.speedMbps.toFixed(0)}</strong> Mbps`;
      if (e.latencyMs) speedStr += ` · ${e.latencyMs}ms`;
    } else {
      speedStr = '<em style="opacity:0.6">속도 미측정</em>';
    }

    const popup = `
      <div style="font-family:Pretendard,-apple-system,sans-serif;line-height:1.55;min-width:140px">
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.2em">${escapeHtml(name)}</div>
        <div style="font-family:JetBrains Mono,monospace;font-size:0.8rem;color:#666;margin-bottom:0.3em">${escapeHtml(e.ssid)}</div>
        <div style="font-size:0.85rem">${speedStr}</div>
        <div style="font-size:0.72rem;color:#999;margin-top:0.3em">${new Date(e.ts).toLocaleDateString('ko-KR')}</div>
      </div>
    `;

    L.marker([lat, lng]).addTo(markersLayer).bindPopup(popup);
  }

  // 범위 맞추기
  if (bounds.length === 1) {
    mapInstance.setView(bounds[0], 16);
  } else {
    mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }

  return { markerCount: withLoc.length };
}
