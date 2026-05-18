# iq-wifi-snap

> 사진 한 장으로 와이파이 끝. 카페·매장에서 와이파이 정보를 찍으면 **SSID 추출 → QR 코드 → 데스크톱 명령어**까지 한 번에.

iq-agent-lab의 첫 번째 일상 유틸리티 에이전트. 정적 호스팅(GitHub Pages) · 백엔드 0 · BYO API key.

---

## 동작 방식

```
[사진/업로드] ──▶ Claude Vision API ──▶ {ssid, password, security}
                                          │
                                          ├──▶ WiFi QR 생성 (폰 카메라로 스캔하면 자동 접속)
                                          └──▶ macOS/Windows/Linux 명령어 (복사해서 터미널 실행)
```

- **순수 정적 웹앱**: HTML/CSS/Vanilla JS · 빌드 단계 없음
- **백엔드 없음**: 모든 처리는 브라우저에서. API 키는 localStorage에만 저장
- **CORS**: `anthropic-dangerous-direct-browser-access: true` 헤더 활용
- **모델**: Claude Haiku 4.5 기본 (저렴 · OCR 수준 충분), Sonnet 4.6 옵션

---

## 로컬에서 실행

ES 모듈을 쓰므로 `file://`로 열면 안 되고 HTTP 서버가 필요합니다.

```bash
cd iq-wifi-snap
python3 -m http.server 8000
# → http://localhost:8000
```

또는:

```bash
npx serve .
```

처음 접속 시 설정 → Anthropic API 키 등록 → 카메라 권한 허용.

> 카메라 API는 `localhost`나 HTTPS에서만 동작합니다. GitHub Pages는 HTTPS라서 문제없음.

---

## GitHub Pages 배포

레포 Settings → Pages → Source를 `main` 브랜치 `/ (root)`로 설정하면 자동 배포.

배포 URL: `https://iq-agent-lab.github.io/iq-wifi-snap/`

---

## 프로젝트 구조

```
iq-wifi-snap/
├── index.html         메인 UI
├── styles.css         디자인 토큰 + 컴포넌트 스타일
├── app.js             진입점 (카메라 / 업로드 / 라우팅 / 이벤트)
├── lib/
│   ├── claude.js      Anthropic API 클라이언트 + 프롬프트
│   ├── wifi.js        WiFi QR 문자열 + OS별 명령어 생성
│   └── storage.js     localStorage 래퍼 (키 / 모델 / 인터페이스 / 기록)
├── README.md
├── LICENSE
└── .gitignore
```

---

## 보안 메모

- API 키는 본인 브라우저 localStorage에만. 서버 전송 없음.
- 이 사이트가 본인용 도구라 큰 위험은 없지만, **이 URL을 공개적으로 공유하지 마세요.** 누가 브라우저 콘솔로 키를 빼낼 수 있음.
- 추출한 비밀번호는 기록에 평문으로 남습니다(편의 vs 보안 트레이드오프). 민감하면 설정에서 기록 비활성화 옵션 추후 추가 예정.

---

## 로드맵

- [x] v0.1 — 사진 → 추출 → QR + 명령어 (현재)
- [ ] v0.2 — 장소 기억(GPS + BSSID), 카페별 자동 복원
- [ ] v0.3 — 카톡 / 딥링크 공유, WiFi QR 다운로드(PNG)
- [ ] v0.4 — 캡티브 포털 자동 통과 보조
- [ ] v0.5 — 온디바이스 OCR 폴백 (Tesseract.js · WiFi 연결 전 오프라인 상황 대응)
- [ ] v0.6 — 데스크톱 컴패니언 (WebSocket 또는 페어링 토큰으로 PC 자동 연결)
- [ ] v0.7 — 자동 속도 측정, 카페별 평균 속도 지도

---

## License

MIT
