#!/usr/bin/env bash
# wifi-snap installer
# Usage: curl -sSL https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.sh | bash

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/iq-agent-lab/iq-wifi-snap/main"
SCRIPT_URL="$REPO_RAW/cli/wifi-snap.sh"
PAGES_FALLBACK="https://iq-agent-lab.github.io/iq-wifi-snap/cli/wifi-snap.sh"

C_CORAL=$'\033[38;5;173m'
C_GREEN=$'\033[32m'
C_DIM=$'\033[2m'
C_RESET=$'\033[0m'

echo "${C_CORAL}● wifi-snap CLI 설치 중...${C_RESET}"

# 설치 위치 결정
if [[ -w "/usr/local/bin" ]] 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
elif command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
  USE_SUDO=1
else
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

echo "  대상 디렉토리: $INSTALL_DIR"

# 다운로드 (GitHub raw 우선, Pages는 폴백)
TMP=$(mktemp)
if ! curl -sSfL "$SCRIPT_URL" -o "$TMP" 2>/dev/null; then
  echo "  ${C_DIM}GitHub raw 실패, Pages에서 재시도...${C_RESET}"
  curl -sSfL "$PAGES_FALLBACK" -o "$TMP" || {
    echo "✗ 다운로드 실패"
    rm -f "$TMP"
    exit 1
  }
fi

# 설치
if [[ "${USE_SUDO:-0}" == "1" ]]; then
  sudo install -m 755 "$TMP" "$INSTALL_DIR/wifi-snap"
else
  install -m 755 "$TMP" "$INSTALL_DIR/wifi-snap" 2>/dev/null || cp "$TMP" "$INSTALL_DIR/wifi-snap" && chmod +x "$INSTALL_DIR/wifi-snap"
fi
rm -f "$TMP"

if [[ ! -x "$INSTALL_DIR/wifi-snap" ]]; then
  echo "✗ 설치 실패"
  exit 1
fi

echo "${C_GREEN}✓${C_RESET} 설치 완료: $INSTALL_DIR/wifi-snap"

# PATH 확인
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo ""
  echo "${C_CORAL}⚠${C_RESET}  $INSTALL_DIR 가 PATH에 없습니다."
  echo "   다음 줄을 ~/.zshrc 또는 ~/.bashrc에 추가하세요:"
  echo ""
  echo "     export PATH=\"$INSTALL_DIR:\$PATH\""
  echo ""
fi

echo ""
echo "다음 명령으로 시작:"
echo "  ${C_CORAL}wifi-snap help${C_RESET}"
