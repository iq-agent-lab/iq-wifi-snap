# Wifi Snap

> 사진 한 장으로 와이파이 끝.

[**Live →**](https://iq-agent-lab.github.io/iq-wifi-snap/) · [데스크톱 CLI](#-데스크톱-cli) · [로드맵](#-로드맵)

카페·매장의 와이파이 카드를 사진으로 찍으면 **Claude Vision**이 SSID와 비밀번호를 자동으로 뽑아내고, **QR 코드 / 데스크톱 명령어 / 공유 링크 / PC 자동 연결**까지 한 번에 처리합니다. 백엔드 0, 사용자 본인 API 키로만 동작. 추출당 비용 ~$0.001.

[`iq-agent-lab`](https://github.com/iq-agent-lab)의 첫 번째 일상 유틸리티 에이전트입니다.

<br>

## ✨ 무엇을 할 수 있나요

- **추출**: Claude Vision으로 카드·스티커·메뉴판·영수증에서 자동 인식
- **오프라인 폴백**: Tesseract.js 한국어 OCR + 로컬 파서로 인터넷 없이도 추출
- **QR + OS 명령어**: 폰 카메라용 WiFi QR, macOS / Windows / Linux 연결 명령어 한 줄
- **공유**: 시스템 공유 시트(카톡/메시지/AirDrop), 카카오톡 SDK 직접 공유, base64 딥링크
- **PC 자동 연결**: `wifi-snap` CLI (macOS · Linux · Windows). 한 번 설치로 한 줄 연결
- **`wifi-snap://` URL 스킴**: 어디서든 링크 클릭만으로 CLI 자동 실행
- **🔊 초음파 오디오 전송**: 인터넷·BT·페어링 없이 폰 스피커 → PC 마이크로 정보 전달
- **속도 측정 + 지도**: Cloudflare speed test로 다운로드/지연 측정, Leaflet/OSM 카페별 지도
- **위치 기억**: GPS로 카페별 자동 기록. 재방문 시 사진 없이 자동 복원
- **PWA**: 홈 화면 설치, 오프라인 캐시. iOS 가이드 / Android 자동 install prompt
- **인앱 브라우저 감지**: 카톡·인스타·네이버 등 WebView에서 외부 브라우저로 이동 안내

<br>

## 🚀 빠른 시작

1. [console.anthropic.com](https://console.anthropic.com/)에서 API 키 발급 (`sk-ant-...`)
2. [Wifi Snap 열기](https://iq-agent-lab.github.io/iq-wifi-snap/) → 우측 상단 **설정**
3. **Anthropic API 키** 칸에 붙여넣고 **저장**
4. 홈으로 돌아와서 **카메라 열기** → 와이파이 카드 촬영 → 끝

iOS Safari 또는 Android Chrome에서 **"홈 화면에 추가"** 하면 PWA로 깔리고 카메라/위치 권한도 더 안정적으로 유지됩니다.

> 💡 **첫 사용 팁**: 설정에서 **위치 기억** 켜두고, **오프라인 OCR**도 미리 다운로드해두면 카페에서 인터넷 없을 때도 추출 가능합니다 (~12MB, 한 번만).

<br>

## 📖 사용법

### 1) 카페에서 와이파이 잡기

```
홈 화면 → 카메라 열기 → 카드 촬영 → 결과 화면
   ↓
SSID / 비밀번호 / QR 코드 / 신뢰도 표시
   ↓
폰 카메라로 QR 비추면 즉시 접속
```

추출이 이상하게 됐으면 SSID/PW 칸을 직접 수정 → "QR 갱신" 버튼으로 다시 만들 수 있어요.

### 2) 친구한테 공유

결과 화면에서:

- **공유** — 시스템 공유 시트 (카톡/메시지/AirDrop/Slack 등)
- **카톡** — 카카오톡 SDK로 카드형 공유 (설정에서 JS 키 등록 시 노출)
- **링크 복사** — `https://iq-agent-lab.github.io/iq-wifi-snap/?wifi=...` 형태의 base64 딥링크
- **QR 저장** — QR을 PNG 파일로 저장

받은 사람은 링크 클릭만 하면 별도 추출 없이 즉시 QR을 봅니다. API 키도 필요 없음.

### 3) 노트북도 같은 와이파이 접속

상황별로 5가지 방법. **굵게** 표시된 게 가장 추천:

| 방법 | 인터넷 필요? | 사전 준비 | 소요 시간 |
|---|---|---|---|
| 직접 타이핑 | 없음 | 없음 | ~30초 |
| **🔊 오디오 전송** | **없음** | **PWA + CLI** | **~10초** |
| 폰 핫스팟 5초 + CLI | 폰 cellular | wifi-snap CLI | ~15초 |
| Kakao/AirDrop + CLI | 폰 cellular | wifi-snap CLI | ~10초 |
| **`wifi-snap://` 클릭** | 전달 방법에 따라 | **CLI + URL 스킴** | **~5초** |

**🔊 오디오 전송이 가장 짜릿한 흐름** (인터넷 0 상태에서 동작):

```
폰 (셀룰러)                              PC (완전 오프라인)
─────────                                ────────────────
와이파이 카드 촬영                       ┃ Wifi Snap PWA 열기 (캐시됨)
   ↓                                    ┃   ↓
결과 화면                                ┃ "🎧 소리로 받기" 클릭
   ↓                                    ┃   ↓
"🔊 소리로 전송" 클릭                    ┃ 받기 시작 (마이크 권한)
   ↓                                    ┃   ↓
~~~~ 띠리리리 ~~~~                ──────→  PC 마이크 캡처 + 디코드
                                        ┃   ↓
                                        ┃ 결과 화면 자동 표시
                                        ┃   ↓
                                        ┃ "이 와이파이로 즉시 연결" 클릭
                                        ┃   ↓
                                        ┃ ✓ Terminal 자동 열림 → 연결
```

폰을 PC 옆에 두고 버튼만 누르면 약 2초 소리 → PC가 알아서 처리. 인터넷·블루투스·페어링·QR 다 필요 없음.

### 4) 오프라인 모드 (인터넷 없는 카페)

카페에 가기 **전에** 한 번 준비:

1. **설정 → 오프라인 OCR** 토글 ON
2. **"오프라인 데이터 다운로드"** 버튼 (한국어+영어 모델 ~12MB)
3. "✓ 준비 완료" 확인

이후 카페에서 인터넷이 없으면:
- Claude API 호출 자동 실패 감지
- "인터넷이 없어요. 오프라인 OCR로 전환합니다..." 메시지
- Tesseract.js로 인식 + 로컬 파서로 SSID/PW 추출
- 결과 화면에 `엔진 Tesseract (오프라인)` 노란 뱃지 표시

정확도는 Claude보다 낮으므로 결과 확인 후 직접 수정이 필요할 수 있습니다.

### 5) 속도 측정 + 카페 지도

**결과 화면 → "📶 속도 측정 → 지금 측정"**
- Cloudflare 공개 엔드포인트로 다운로드 5MB + 지연시간 측정 (~6-10초)
- 다운로드 Mbps / 지연시간 ms / 평가(쾌적·양호·보통·느림)
- 자동으로 기록에 저장

**지도 탭**
- Leaflet + OpenStreetMap으로 위치 기억된 카페 핀 표시
- 핀 탭 → SSID·속도·날짜 팝업
- 등급별 색상으로 한눈에 어디가 빠른지 확인

<br>

## 💻 데스크톱 CLI

> 자세한 문서 → [cli/README.md](./cli/README.md)

### 설치 (한 번만)

**macOS / Linux**:
```bash
curl -sSL https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.sh | bash
```

**Windows (PowerShell)**:
```powershell
iwr -useb https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.ps1 | iex
```

자동으로 둘 다 설치됩니다:
- `wifi-snap` 명령어
- **`wifi-snap://` URL 스킴 핸들러** (macOS `.app` / Linux `.desktop` / Windows 레지스트리)

### 사용

```bash
# 공유 URL을 그대로 인자로 (https 또는 wifi-snap://)
wifi-snap "https://iq-agent-lab.github.io/iq-wifi-snap/?wifi=eyJzIjoi..."
wifi-snap "wifi-snap://?wifi=eyJzIjoi..."

# 또는 직접
wifi-snap connect "Starbucks" "passw0rd"

# 디코드만 (연결 안 함, 검증용)
wifi-snap decode "https://...?wifi=..."
```

설치 후엔 어디서든(Slack·이메일·Notion 등) `wifi-snap://` 링크를 **클릭만 해도** 자동으로 Terminal이 열리고 연결됩니다.

### 동작

CLI는 외부 서버 호출 없음. URL의 base64 페이로드만 디코드해서 OS별 명령으로 변환:

| OS | 사용 도구 | 권한 |
|---|---|---|
| macOS | `networksetup -setairportnetwork` | 일반 |
| Linux | `nmcli dev wifi connect` | 일반 (NetworkManager) |
| Windows | `netsh wlan add profile` + `connect` | 일반 |

<br>

## 🔐 프라이버시

- **Anthropic API 키**: 브라우저 localStorage에만. 우리 서버로 전송 안 함.
- **추출한 이미지**: Anthropic API로만 전송. 우리 서버 없음 (애초에 백엔드 0).
- **위치 정보**: 옵션. 활성화 시 브라우저 localStorage에만 저장.
- **추출 기록**: 최근 50개까지 브라우저 localStorage. 클라우드 동기화 없음.
- **분석/추적**: 0. 로그 0. 쿠키 0.
- **CLI**: 외부 서버 호출 0. URL 디코드 + OS 명령만.
- **오디오 전송**: P2P (스피커 → 마이크). 외부 네트워크 통과 안 함.

브라우저 데이터를 지우면 모든 기록이 사라집니다. 백업이 필요하면 직접 localStorage를 export 하세요.

<br>

## 💰 비용

| 구성 요소 | 비용 |
|---|---|
| Claude Haiku 4.5 (이미지 입력) | **~$0.001 / 추출** |
| GitHub Pages | $0 |
| Cloudflare speed test | $0 |
| OpenStreetMap 타일 | $0 |
| ggwave (오디오) | $0 |
| Tesseract.js (OCR) | $0 |
| Leaflet (지도) | $0 |
| Kakao SDK (옵션) | $0 (앱 등록 무료) |

월 100회 추출해도 약 $0.10. **유일한 비용은 본인의 Anthropic API key.**

<br>

## 🏗️ 구조

```
iq-wifi-snap/
├── index.html          UI 마크업
├── styles.css          스타일 (코랄 액센트 #cc785c)
├── app.js              메인 진입점, 모든 화면 라우팅
├── manifest.json       PWA 매니페스트
├── sw.js               서비스 워커 (앱 셸 캐시)
├── README.md           이 파일
├── LICENSE             MIT
│
├── icons/              아이콘 (favicon 3종 + Apple touch 3종 + PWA 3종 + maskable)
├── examples/           테스트용 와이파이 카드 이미지 3종
│
├── cli/                데스크톱 컴패니언 (v0.8+)
│   ├── wifi-snap.sh    bash 스크립트 (macOS · Linux)
│   ├── wifi-snap.ps1   PowerShell (Windows)
│   ├── install.sh      한 줄 설치 (URL 스킴 핸들러 포함)
│   ├── install.ps1     한 줄 설치 (Windows)
│   └── README.md
│
└── lib/                모듈
    ├── claude.js       Anthropic API + 추출 프롬프트
    ├── wifi.js         WiFi QR 문자열 + OS 명령어 생성
    ├── location.js     GPS + Haversine 거리
    ├── share.js        공유 URL (base64) + Web Share API + QR PNG
    ├── kakao.js        Kakao JS SDK 동적 로딩
    ├── ocr.js          Tesseract.js 동적 로딩
    ├── parser.js       OCR 텍스트 → SSID/PW 로컬 파서
    ├── env.js          브라우저/인앱/플랫폼 환경 감지
    ├── speedtest.js    Cloudflare speed test
    ├── map.js          Leaflet + OpenStreetMap 지도
    ├── audio.js        ggwave 오디오 송수신 (v0.12)
    └── storage.js      localStorage 래퍼
```

전부 vanilla JS (no React/Vue/build step). ES modules로 직접 import.

<br>

## 🌐 브라우저 호환성

| 기능 | 지원 |
|---|---|
| 추출 (사진 → SSID) | Chrome · Edge · Safari (iOS 16+) · Firefox |
| PWA 설치 | Chrome · Edge · Safari (iOS 16.4+) |
| 카메라 | 모두 (HTTPS 필수) |
| 위치 | 모두 (HTTPS 필수) |
| 오디오 송수신 | Chrome · Edge · Safari (iOS 14.5+) · Firefox |
| 오프라인 OCR (WebAssembly) | 모두 |
| 시스템 공유 시트 | iOS Safari · Android Chrome · 모바일 일반 |
| `wifi-snap://` URL 스킴 | OS별 핸들러 설치 시 모든 OS |

**인앱 브라우저** (카톡·인스타·페이스북·네이버 등)는 권한이 불안정해서 자동 감지 후 외부 브라우저 이동 안내가 뜹니다.

<br>

## 🛠️ 개발

로컬에서 실행하려면 정적 서버만 띄우면 됩니다 (file:// 는 SW/모듈 제약 때문에 안 됨):

```bash
git clone https://github.com/iq-agent-lab/iq-wifi-snap
cd iq-wifi-snap
python3 -m http.server 8000
# → http://localhost:8000
```

빌드 단계 없음. 파일 수정 → 새로고침.

서비스 워커 캐시 때문에 변경이 안 보이면:
- 데스크톱: DevTools → Application → Service Workers → "Unregister"
- 모바일 PWA: 잠시 백그라운드 → 다시 열기

<br>

## 🗺️ 로드맵

- [x] **v0.1** — 사진 → 추출 → QR + OS 명령어
- [x] **v0.2** — PWA, GPS 위치 기억, 라벨링
- [x] **v0.3** — 공유 URL 딥링크, Web Share API, QR PNG 저장, 인라인 편집
- [x] **v0.4** — 브랜드 "Wifi Snap", 커스텀 삭제 확인, 카메라 권한 상태 표시
- [x] **v0.5** — 🐛 `[hidden]` CSS 충돌 픽스, 카카오톡 SDK 공유, 캡티브 포털 보조
- [x] **v0.6** — 온디바이스 OCR 폴백 (Tesseract.js + 로컬 파서)
- [x] **v0.7** — 인앱 브라우저 감지, 위치 권한 흐름 개선, OCR 사전 다운로드 안내
- [x] **v0.8** — 데스크톱 CLI (`wifi-snap`, macOS/Linux/Windows)
- [x] **v0.9** — 아이콘 재디자인 (레퍼런스 앱 스타일), favicon 사이즈 확장
- [x] **v0.10** — 자동 속도 측정 (Cloudflare) + 카페 지도 (Leaflet/OSM)
- [x] **v0.11** — `wifi-snap://` 커스텀 URL 스킴 (어디서든 클릭만으로 CLI)
- [x] **v0.12** — 초음파 오디오 전송 (ggwave). 진정한 무연결 폰→PC

핵심 기능은 v0.12에서 완성. 이후엔 사용 피드백 기반 폴리시 위주로 갈 예정.

<br>

## 🤝 만든 사람

**IQ** (한동희) · [`@e9ua1`](https://github.com/e9ua1)

[`iq-agent-lab`](https://github.com/iq-agent-lab) 조직의 첫 번째 일상 유틸리티 에이전트.

## 📜 라이센스

[MIT](./LICENSE)
