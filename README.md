# iq-wifi-snap

> 사진 한 장으로 와이파이 끝. 카페·매장에서 와이파이 정보를 찍으면 **SSID 추출 → QR 코드 → 데스크톱 명령어 → 친구한테 링크 공유**까지 한 번에.

iq-agent-lab의 첫 번째 일상 유틸리티 에이전트. 정적 호스팅(GitHub Pages) · 백엔드 0 · BYO API key.

---

## 동작 방식

```
[사진/업로드] ──▶ Claude Vision API ──▶ {ssid, password, security}
                                          │
                                          ├──▶ WiFi QR 생성 (폰 카메라로 스캔하면 자동 접속)
                                          ├──▶ macOS/Windows/Linux 명령어 (복사해서 터미널 실행)
                                          ├──▶ 위치(GPS)와 함께 기록 → 재방문 시 자동 복원
                                          └──▶ 공유 링크 생성 → 친구도 API 키 없이 즉시 사용
```

- **순수 정적 웹앱 + PWA**: HTML/CSS/Vanilla JS · 빌드 단계 없음
- **백엔드 없음**: 모든 처리는 브라우저에서. API 키는 localStorage에만 저장
- **CORS**: `anthropic-dangerous-direct-browser-access: true` 헤더 활용
- **모델**: Claude Haiku 4.5 기본 (저렴 · OCR 수준 충분), Sonnet 4.6 옵션
- **PWA**: 홈 화면 설치 가능, 오프라인 셸 캐싱
- **장소 기억**: GPS와 함께 저장, 100m 이내 재방문 시 자동 복원
- **공유**: 카톡·메시지·AirDrop 등 시스템 공유 시트. 받는 사람은 API 키 없이 링크 클릭만으로 QR 확인.

---

## 공유 흐름 (v0.3)

```
IQ가 카페에서 사진 한 장 → 추출 → 공유 버튼 탭
  → 시스템 공유 시트 → 카톡으로 친구한테 전송
    → 친구가 링크 클릭 → 즉시 QR 표시 (API 호출 0회)
      → 친구 폰 카메라로 QR 비추기 → 와이파이 접속
```

링크 형식: `https://iq-agent-lab.github.io/iq-wifi-snap/?wifi=<base64>`

base64 안에 SSID/PW/security만 들어있어서 받는 사람 데이터로는 0바이트만 소비. 본인 API 키 없어도 작동. 공유받은 정보는 받는 사람의 history에 자동 저장되지 않음.

---

## 로컬에서 실행

```bash
cd iq-wifi-snap
python3 -m http.server 8000
# → http://localhost:8000
```

처음 접속 시 설정 → Anthropic API 키 등록 → 카메라 권한 허용.

위치 기억 기능 쓰려면 설정 → "위치 기억" 토글 ON (위치 권한 요청됨).

---

## GitHub Pages 배포

Settings → Pages → Source `Deploy from a branch` → `main` / `(root)`.

배포 URL: **`https://iq-agent-lab.github.io/iq-wifi-snap/`**

---

## 프로젝트 구조

```
iq-wifi-snap/
├── index.html          메인 UI
├── styles.css          디자인 토큰 + 컴포넌트
├── app.js              진입점 (카메라/업로드/공유/PWA)
├── manifest.json       PWA 매니페스트
├── sw.js               서비스 워커
├── icons/              PNG 아이콘 + SVG 원본
└── lib/
    ├── claude.js       Anthropic API + 프롬프트
    ├── wifi.js         WiFi QR + OS 명령어
    ├── location.js     GPS + Haversine
    ├── share.js        공유 URL + Web Share API + QR PNG
    └── storage.js      localStorage 래퍼
```

---

## 사용 흐름

### 처음 카페 방문
1. 홈 화면 아이콘 탭 (PWA 설치한 경우)
2. **카메라 열기** → 와이파이 정보 촬영
3. SSID/PW 추출 → 결과 화면
4. (필요 시) SSID/PW 직접 수정 → **QR 갱신** 버튼
5. **공유** 버튼 → 친구한테 카톡으로 전송, 또는
6. **QR 저장** → 이미지 파일로 다운로드, 또는
7. 폰: QR 비추기, 노트북: 명령어 복사 후 터미널 실행

### 같은 카페 재방문
1. 앱 열기 → 상단에 "근처에서 사용했던 와이파이" 자동 표시 → 탭

### 친구가 공유받은 링크 열기
1. 카톡에서 링크 클릭
2. 자동으로 결과 화면 + "📨 공유받은 와이파이 정보예요" 배너
3. QR 비추기 → 접속

---

## 보안 메모

- API 키는 본인 브라우저 localStorage에만. 서버 전송 없음.
- 위치 좌표도 localStorage에만 저장. 외부 전송 없음.
- **공유 링크는 와이파이 비밀번호를 그대로 포함하므로**, 신뢰하는 사람한테만 보내세요.
- 이 사이트 URL 자체를 공개적으로 공유하지 마세요 (API 키는 본인 브라우저에만 있어서 안전하긴 하지만, 브라우저 콘솔로 추출은 가능).

---

## 로드맵

- [x] **v0.1** — 사진 → 추출 → QR + 명령어
- [x] **v0.2** — PWA화, GPS 위치 기억, 라벨링
- [x] **v0.3** — 공유 (Web Share API + 딥링크), QR PNG 다운로드, 수동 편집
- [ ] v0.4 — 캡티브 포털 자동 통과 보조
- [ ] v0.5 — 온디바이스 OCR 폴백 (Tesseract.js · 오프라인 상황)
- [ ] v0.6 — 데스크톱 컴패니언 (WebSocket / 페어링)
- [ ] v0.7 — 자동 속도 측정, 카페별 평균 속도 지도

---

## License

MIT
