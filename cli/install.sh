#!/usr/bin/env bash
# wifi-snap installer v0.11
# Usage: curl -sSL https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.sh | bash

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/iq-agent-lab/iq-wifi-snap/main"
SCRIPT_URL="$REPO_RAW/cli/wifi-snap.sh"
PAGES_FALLBACK="https://iq-agent-lab.github.io/iq-wifi-snap/cli/wifi-snap.sh"

C_CORAL=$'\033[38;5;173m'
C_GREEN=$'\033[32m'
C_DIM=$'\033[2m'
C_BOLD=$'\033[1m'
C_RESET=$'\033[0m'

OS="$(uname -s)"

echo "${C_BOLD}● wifi-snap CLI v0.11 설치 중...${C_RESET}"
echo ""

# ============================================================
# 1) CLI binary
# ============================================================

if [[ -w "/usr/local/bin" ]] 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
elif command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
  USE_SUDO=1
else
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

echo "${C_CORAL}[1/2]${C_RESET} CLI 바이너리 → $INSTALL_DIR/wifi-snap"

TMP=$(mktemp)
if ! curl -sSfL "$SCRIPT_URL" -o "$TMP" 2>/dev/null; then
  echo "  ${C_DIM}GitHub raw 실패, Pages에서 재시도...${C_RESET}"
  curl -sSfL "$PAGES_FALLBACK" -o "$TMP" || {
    echo "✗ 다운로드 실패"
    rm -f "$TMP"
    exit 1
  }
fi

if [[ "${USE_SUDO:-0}" == "1" ]]; then
  sudo install -m 755 "$TMP" "$INSTALL_DIR/wifi-snap"
else
  install -m 755 "$TMP" "$INSTALL_DIR/wifi-snap" 2>/dev/null || \
    (cp "$TMP" "$INSTALL_DIR/wifi-snap" && chmod +x "$INSTALL_DIR/wifi-snap")
fi
rm -f "$TMP"

[[ ! -x "$INSTALL_DIR/wifi-snap" ]] && { echo "✗ 설치 실패"; exit 1; }
echo "  ${C_GREEN}✓${C_RESET} 완료"
echo ""

# ============================================================
# 2) URL scheme handler (wifi-snap://)
# ============================================================

echo "${C_CORAL}[2/2]${C_RESET} URL 스킴 핸들러 등록 (wifi-snap://)"

WIFI_SNAP_BIN="$INSTALL_DIR/wifi-snap"

if [[ "$OS" == "Darwin" ]]; then
  # macOS: .app bundle + LaunchServices
  APP_DIR="$HOME/Applications/WifiSnapHandler.app"
  mkdir -p "$APP_DIR/Contents/MacOS"

  cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>WifiSnapHandler</string>
  <key>CFBundleIdentifier</key>
  <string>dev.iq.wifi-snap-handler</string>
  <key>CFBundleName</key>
  <string>Wifi Snap Handler</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>0.11.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.11.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSBackgroundOnly</key>
  <false/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Wifi Snap Protocol</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>wifi-snap</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST

  # 핸들러 스크립트: Terminal 열어서 wifi-snap 실행
  cat > "$APP_DIR/Contents/MacOS/WifiSnapHandler" <<HANDLER
#!/bin/bash
# Wifi Snap URL scheme handler — opens Terminal and runs wifi-snap CLI
URL="\$1"

if [[ -z "\$URL" ]]; then
  osascript -e 'display alert "Wifi Snap" message "URL이 전달되지 않았습니다."'
  exit 1
fi

WIFI_SNAP=""
for path in /usr/local/bin/wifi-snap "\$HOME/.local/bin/wifi-snap"; do
  [[ -x "\$path" ]] && WIFI_SNAP="\$path" && break
done

if [[ -z "\$WIFI_SNAP" ]]; then
  osascript -e 'display alert "Wifi Snap" message "wifi-snap CLI를 찾지 못했습니다.\\n다시 설치해주세요:\\ncurl -sSL https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.sh | bash"'
  exit 1
fi

# Escape URL for AppleScript
ESCAPED_URL="\${URL//\\\\/\\\\\\\\}"
ESCAPED_URL="\${ESCAPED_URL//\\"/\\\\\\"}"

osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "'\$WIFI_SNAP' \\"\$ESCAPED_URL\\"; echo; echo -n '엔터를 누르면 창이 닫힙니다... '; read -r; exit"
end tell
APPLESCRIPT
HANDLER

  chmod +x "$APP_DIR/Contents/MacOS/WifiSnapHandler"

  # LaunchServices 등록
  LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  if [[ -x "$LSREG" ]]; then
    "$LSREG" -f "$APP_DIR" 2>/dev/null || true
  fi

  echo "  ${C_GREEN}✓${C_RESET} macOS: $APP_DIR"
  echo "  ${C_DIM}wifi-snap:// 링크를 클릭하면 Terminal이 열려서 자동 실행됩니다.${C_RESET}"

elif [[ "$OS" == "Linux" ]]; then
  # Linux: .desktop file + xdg-mime
  DESKTOP_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"

  cat > "$DESKTOP_DIR/wifi-snap.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Wifi Snap Handler
Comment=Apply WiFi from wifi-snap:// URLs
Exec=$WIFI_SNAP_BIN %u
Terminal=true
NoDisplay=true
MimeType=x-scheme-handler/wifi-snap;
Categories=Network;Utility;
DESKTOP

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  fi
  if command -v xdg-mime >/dev/null 2>&1; then
    xdg-mime default wifi-snap.desktop x-scheme-handler/wifi-snap 2>/dev/null || true
  fi

  echo "  ${C_GREEN}✓${C_RESET} Linux: $DESKTOP_DIR/wifi-snap.desktop"
  echo "  ${C_DIM}wifi-snap:// 링크를 클릭하면 터미널에서 자동 실행됩니다.${C_RESET}"

else
  echo "  ${C_DIM}URL 스킴 등록은 macOS/Linux만 지원. (현재: $OS)${C_RESET}"
fi

echo ""

# ============================================================
# PATH check
# ============================================================
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo "${C_CORAL}⚠${C_RESET}  $INSTALL_DIR 가 PATH에 없습니다."
  echo "   다음을 ~/.zshrc 또는 ~/.bashrc에 추가:"
  echo ""
  echo "     ${C_BOLD}export PATH=\"$INSTALL_DIR:\$PATH\"${C_RESET}"
  echo ""
fi

echo "${C_BOLD}완료.${C_RESET} 다음 명령으로 시작:"
echo "  ${C_CORAL}wifi-snap help${C_RESET}"
echo ""
echo "또는 wifi-snap:// 링크를 어디서든 클릭하면 자동 실행됩니다."
