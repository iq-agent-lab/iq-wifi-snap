# iq-wifi-snap

> 사진 한 장으로 와이파이 끝. 카페·매장에서 와이파이 정보를 찍으면 **SSID 추출 → QR 코드 → 데스크톱 명령어**까지 한 번에.

iq-agent-lab의 첫 번째 일상 유틸리티 에이전트. 정적 호스팅(GitHub Pages) · 백엔드 0 · BYO API key.

---

## 동작 방식

```
[사진/업로드] ──▶ Claude Vision API ──▶ {ssid, password, security}
                                          │
                                          ├──▶ WiFi QR 생성 (폰 카메라로 스캔하면 자동 접속)
                                          ├──▶ macOS/Windows/Linux 명령어 (복사해서 터미널 실행)
                                          └──▶ 위치(GPS)와 함께 기록 → 재방문 시 자동 복원
```

- **순수 정적 웹앱 + PWA**: HTML/CSS/Vanilla JS · 빌드 단계 없음
- **백엔드 없음**: 모든 처리는 브라우저에서. API 키는 localStorage에만 저장
- **CORS**: `anthropic-dangerous-direct-browser-access: true` 헤더 활용
- **모델**: Claude Haiku 4.5 기본 (저렴 · OCR 수준 충분), Sonnet 4.6 옵션
- **PWA**: 홈 화면 설치 가능, 오프라인 셸 캐싱(앱 로딩 자체는 인터넷 없어도 됨)
- **장소 기억**: GPS와 함께 저장, 100m 이내 재방문 시 자동 복원

---

## 로컬에서 실행

ES 모듈 + 서비스 워커를 쓰므로 `file://`로 열면 안 되고 HTTP 서버가 필요합니다.

```bash
cd iq-wifi-snap
python3 -m http.server 8000
# → http://localhost:8000
```

처음 접속 시 설정 → Anthropic API 키 등록 → 카메라 권한 허용.

위치 기억 기능 쓰려면 설정 → "위치 기억" 토글 ON (위치 권한 요청됨).

> 카메라/위치 API는 `localhost`나 HTTPS에서만 동작. GitHub Pages는 HTTPS라서 문제없음.

---

## GitHub Pages 배포

Settings → Pages → Source `Deploy from a branch` → `main` / `(root)`.

배포 URL: **`https://iq-agent-lab.github.io/iq-wifi-snap/`**

---

## 프로젝트 구조

```
iq-wifi-snap/
├── index.html          메인 UI
├── styles.css          디자인 토큰 + 컴포넌트 스타일
├── app.js              진입점 (카메라 / 업로드 / 라우팅 / PWA 등록)
├── manifest.json       PWA 매니페스트
├── sw.js               서비스 워커 (오프라인 셸 캐시)
├── icons/
│   ├── icon.svg        원본
│   ├── icon-180.png    Apple touch
│   ├── icon-192.png    PWA standard
│   ├── icon-512.png    PWA standard
│   └── icon-512-maskable.png  Android adaptive
├── lib/
│   ├── claude.js       Anthropic API 클라이언트 + 프롬프트
│   ├── wifi.js         WiFi QR 문자열 + OS별 명령어
│   ├── location.js     GPS + Haversine 거리 + 근처 찾기
│   └── storage.js      localStorage 래퍼
├── README.md
├── LICENSE
└── .gitignore
```

---

## 사용 흐름

### 처음 카페 방문
1. 홈 화면 추가한 아이콘 탭 (PWA 설치했다면)
2. **카메라 열기** → 와이파이 정보 촬영
3. SSID/PW 추출 → QR 코드 표시
4. 폰: QR을 다른 폰 카메라로 비추거나, 같은 폰이면 비밀번호 복사해서 와이파이 설정에 붙여넣기
5. 노트북: macOS 명령어 복사 → 터미널 실행
6. 라벨 입력칸에 "스타벅스 강남" 같이 메모 저장(선택)

### 같은 카페 재방문
1. 홈 화면에서 앱 열기
2. 위에 **"근처에서 사용했던 와이파이"** 자동 표시
3. 탭 → 바로 QR + 명령어 화면

---

## 보안 메모

- API 키는 본인 브라우저 localStorage에만. 서버 전송 없음.
- 위치 좌표도 localStorage에만 저장. 외부 전송 없음.
- 이 사이트가 본인용 도구라 큰 위험은 없지만, **이 URL을 공개적으로 공유하지 마세요.** 누가 브라우저 콘솔로 키를 빼낼 수 있음.
- 추출한 비밀번호는 기록에 평문으로 남습니다(편의 vs 보안 트레이드오프).

---

## 로드맵

- [x] **v0.1** — 사진 → 추출 → QR + 명령어
- [x] **v0.2** — PWA화, GPS 위치 기억, 라벨링, 근처 카페 자동 복원
- [ ] v0.3 — 카톡 / 딥링크 공유, WiFi QR PNG 다운로드
- [ ] v0.4 — 캡티브 포털 자동 통과 보조
- [ ] v0.5 — 온디바이스 OCR 폴백 (Tesseract.js · WiFi 연결 전 오프라인 상황)
- [ ] v0.6 — 데스크톱 컴패니언 (WebSocket / 페어링 토큰)
- [ ] v0.7 — 자동 속도 측정, 카페별 평균 속도 지도

---

## License

MIT
