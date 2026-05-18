// lib/location.js
// GPS + Haversine 거리 계산

/**
 * 현재 위치를 가져옴
 * @returns {Promise<{lat:number, lng:number, acc:number}>}
 */
export function getCurrentPosition({ timeout = 8000, maxAge = 30000 } = {}) {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new Error('이 브라우저는 위치 서비스를 지원하지 않습니다'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
        }),
      (err) => reject(new Error(`위치 가져오기 실패: ${err.message}`)),
      { enableHighAccuracy: true, timeout, maximumAge: maxAge }
    );
  });
}

/**
 * 두 좌표 사이 거리 (m) - Haversine
 */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * history 항목 중 현재 위치와 가까운 것들 찾기
 * @returns 정렬된 {entry, dist} 배열
 */
export function findNearby(current, entries, radiusM = 80) {
  if (!current) return [];
  return entries
    .filter((e) => e.location && typeof e.location.lat === 'number')
    .map((e) => ({ entry: e, dist: distanceMeters(current, e.location) }))
    .filter((x) => x.dist <= radiusM)
    .sort((a, b) => a.dist - b.dist);
}

/**
 * 거리 표시 포맷
 */
export function formatDistance(m) {
  if (m < 10) return '바로 여기';
  if (m < 100) return `${Math.round(m)}m`;
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}
