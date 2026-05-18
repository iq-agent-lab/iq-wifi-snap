# wifi-snap CLI

데스크톱(macOS · Linux · Windows)에서 [Wifi Snap](https://iq-agent-lab.github.io/iq-wifi-snap/)으로 추출한 와이파이에 한 줄로 접속하는 컴패니언 도구.

## 설치

### macOS / Linux

```bash
curl -sSL https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.sh | bash
```

설치되면 `/usr/local/bin/wifi-snap` 또는 `~/.local/bin/wifi-snap` 에 들어갑니다.

### Windows (PowerShell)

```powershell
iwr -useb https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.ps1 | iex
```

`%USERPROFILE%\bin\wifi-snap.ps1` 에 설치되고, `wifi-snap.cmd` 래퍼도 같이 깔립니다.

## 사용

### 공유 URL로 연결

폰에서 추출한 다음 "링크 복사"로 받은 URL을 그대로 인자로:

```bash
wifi-snap "https://iq-agent-lab.github.io/iq-wifi-snap/?wifi=eyJzIjoi..."
```

이게 가장 일반적인 사용 패턴. 폰 → 본인 카톡/메시지/메모로 URL 보냄 → 데스크톱 터미널에 붙여넣기.

### 직접 지정

```bash
wifi-snap connect "Starbucks" "passw0rd"
wifi-snap connect "OpenNetwork"          # 공개 와이파이는 PW 생략
```

### 디코드만 (연결 안 함)

```bash
wifi-snap decode "https://...?wifi=eyJ..."
```

URL 안에 뭐가 들었는지 확인용. 친구가 보낸 링크를 검증하고 싶을 때.

### URL 스킴 (v0.11+)

인스톨러가 OS에 `wifi-snap://` URL 스킴 핸들러를 자동 등록합니다.
이후 어디서든(브라우저·Slack·이메일·Notion) **`wifi-snap://?wifi=...` 링크를 클릭하면**
별도 터미널 없이 자동으로 wifi-snap CLI가 실행되어 연결됩니다.

**활용 흐름**:
1. 폰에서 추출 → 결과 화면의 "이 와이파이로 즉시 연결" 링크 우클릭 → 링크 복사
2. PC에서 카톡/AirDrop/Continuity 클립보드 등으로 받기
3. 받은 링크 클릭 → 자동 실행

**설치 위치별 동작**:
- **macOS**: `~/Applications/WifiSnapHandler.app` (LaunchServices 등록) → 클릭 시 Terminal 자동 열림
- **Linux**: `~/.local/share/applications/wifi-snap.desktop` (xdg-mime) → 터미널 자동 실행
- **Windows**: `HKCU\Software\Classes\wifi-snap` 레지스트리 → PowerShell 창 자동 실행

### 도움말 / 버전

```bash
wifi-snap help
wifi-snap version
```

## 동작 원리

| OS | 사용 도구 | 권한 |
|----|-----------|------|
| macOS  | `networksetup -setairportnetwork` | 일반 |
| Linux  | `nmcli dev wifi connect`          | 일반 (NetworkManager) |
| Windows| `netsh wlan add profile` + `connect` | 일반 |

공유 URL의 `?wifi=` 파라미터는 base64-encoded JSON `{s, p, t, l}` 입니다. CLI는 이를 디코드해서 OS별 명령어로 변환만 합니다. 외부 서버 호출 없음.

## 옵션

### macOS 네트워크 인터페이스 변경

기본은 `en0`. M1/M2에서 dock 사용 시 `en7` 등일 수 있습니다.

```bash
WIFI_SNAP_IFACE=en7 wifi-snap connect "MyWifi" "pw"
```

확인 방법:
```bash
networksetup -listallhardwareports
```

## 보안 메모

- 공유 URL은 SSID/PW가 base64로 그대로 들어있어요. **신뢰하는 사람한테서 받은 URL만** 실행하세요.
- CLI는 `eval` 같은 위험한 동작을 절대 안 하지만, 인자를 의심스러운 SSID/PW로 받으면 OS 명령에 그대로 넘어갑니다(따옴표 처리는 안전).
- 비밀번호가 history에 남는 게 싫으면 zsh/bash에서 `setopt HIST_IGNORE_SPACE` (또는 `.bashrc`에 `HISTCONTROL=ignorespace`) 설정하고 명령어 앞에 공백 한 칸 두고 실행.

## 제거

```bash
# macOS / Linux
rm /usr/local/bin/wifi-snap        # 또는 ~/.local/bin/wifi-snap

# Windows
Remove-Item $env:USERPROFILE\bin\wifi-snap.ps1
Remove-Item $env:USERPROFILE\bin\wifi-snap.cmd
```

## 직접 다운로드

설치 스크립트가 싫으면 직접:

- macOS / Linux: [wifi-snap.sh](./wifi-snap.sh)
- Windows: [wifi-snap.ps1](./wifi-snap.ps1)

다운받아서 PATH 어딘가에 놓고 실행 권한만 주면 끝.
