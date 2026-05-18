#!/usr/bin/env bash
# wifi-snap CLI v0.8.0
# Desktop companion for Wifi Snap. Apply WiFi from a share URL or args.
# https://github.com/iq-agent-lab/iq-wifi-snap

set -euo pipefail

VERSION="0.11.0"
REPO_URL="https://github.com/iq-agent-lab/iq-wifi-snap"

# ============== colors ==============
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_CORAL=$'\033[38;5;173m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_CORAL=''
fi

log()  { printf "%s●%s %s\n" "$C_CORAL" "$C_RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$C_GREEN" "$C_RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$C_RED"   "$C_RESET" "$*" >&2; }
die()  { err "$@"; exit 1; }

# ============== usage ==============
usage() {
  cat <<EOF
${C_BOLD}wifi-snap CLI${C_RESET} v$VERSION
  Companion for ${C_CORAL}Wifi Snap${C_RESET} — apply extracted WiFi to this machine.

${C_BOLD}USAGE${C_RESET}
  wifi-snap <share-url>             공유 URL 디코드 후 연결
  wifi-snap connect <ssid> [pw]     SSID/PW 직접 지정해 연결
  wifi-snap decode <share-url>      디코드만 (연결 안 함)
  wifi-snap version                 버전 표시
  wifi-snap help                    이 도움말

${C_BOLD}EXAMPLES${C_RESET}
  ${C_DIM}# 공유 URL을 그대로 인자로 (https 또는 wifi-snap://)${C_RESET}
  wifi-snap "https://iq-agent-lab.github.io/iq-wifi-snap/?wifi=eyJzIjoi..."
  wifi-snap "wifi-snap://?wifi=eyJzIjoi..."

  ${C_DIM}# 또는 직접${C_RESET}
  wifi-snap connect "Starbucks" "passw0rd"

${C_BOLD}URL SCHEME${C_RESET}
  v0.11 인스톨러가 OS에 ${C_CORAL}wifi-snap://${C_RESET} 스킴을 등록합니다.
  이후 어디서든 wifi-snap:// 링크를 클릭하면 이 CLI가 자동 실행돼요.

${C_BOLD}ENVIRONMENT${C_RESET}
  WIFI_SNAP_IFACE=en0   macOS 네트워크 인터페이스 (기본 en0)
                        ${C_DIM}networksetup -listallhardwareports로 확인${C_RESET}

${C_BOLD}LEARN MORE${C_RESET}
  $REPO_URL
EOF
}

# ============== base64 / json helpers ==============

# URL-safe base64 decode (no padding allowed)
decode_b64() {
  local input="$1"
  # URL-safe → standard
  input="${input//-/+}"
  input="${input//_//}"
  # Pad with '=' to multiple of 4
  while (( ${#input} % 4 != 0 )); do
    input="${input}="
  done
  printf '%s' "$input" | base64 -d 2>/dev/null
}

# Extract wifi= param value from a URL
extract_payload() {
  local url="$1"
  local payload="${url##*wifi=}"
  payload="${payload%%&*}"
  payload="${payload%%#*}"
  printf '%s' "$payload"
}

# Get JSON string value for a top-level key.
# Only handles our schema: {"s":"...","p":"...","t":"...","l":"..."}
# Robust enough for our base64-payload but does NOT support all JSON.
json_get() {
  local json="$1" key="$2"
  # Use sed to extract value between quotes after "key":
  printf '%s' "$json" \
    | sed -nE "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p" \
    | head -1
}

# ============== core ops ==============

decode_share() {
  local url="$1"
  local payload
  payload=$(extract_payload "$url")
  [[ -z "$payload" ]] && die "URL에서 wifi 파라미터를 찾지 못했습니다."
  local json
  json=$(decode_b64 "$payload")
  [[ -z "$json" ]] && die "base64 디코드 실패. URL이 올바른가요?"
  printf '%s' "$json"
}

cmd_decode() {
  local url="$1"
  local json
  json=$(decode_share "$url")
  local ssid pw sec label
  ssid=$(json_get "$json" s)
  pw=$(json_get "$json" p)
  sec=$(json_get "$json" t)
  label=$(json_get "$json" l)

  [[ -z "$ssid" ]] && die "디코드된 데이터에 SSID가 없습니다."

  ok "디코드 완료"
  printf "  %sSSID%s     %s\n" "$C_BOLD" "$C_RESET" "$ssid"
  printf "  %sPW%s       %s\n" "$C_BOLD" "$C_RESET" "${pw:-(없음)}"
  printf "  %sSecurity%s %s\n" "$C_BOLD" "$C_RESET" "${sec:-WPA}"
  [[ -n "$label" ]] && printf "  %sLabel%s    %s\n" "$C_BOLD" "$C_RESET" "$label"
}

cmd_connect() {
  local ssid="$1" pw="${2:-}"
  [[ -z "$ssid" ]] && die "SSID가 비어있습니다."

  local os
  case "$(uname -s)" in
    Darwin*) os="macos";;
    Linux*)  os="linux";;
    *) die "지원하지 않는 OS: $(uname -s)";;
  esac

  log "OS: $os  ·  SSID: $ssid"

  if [[ "$os" == "macos" ]]; then
    local iface="${WIFI_SNAP_IFACE:-en0}"
    log "networksetup ($iface) 실행 중..."
    if [[ -z "$pw" ]]; then
      networksetup -setairportnetwork "$iface" "$ssid"
    else
      networksetup -setairportnetwork "$iface" "$ssid" "$pw"
    fi
    ok "연결 명령 완료. (실제 연결까지 몇 초 걸릴 수 있어요)"
  elif [[ "$os" == "linux" ]]; then
    if ! command -v nmcli >/dev/null 2>&1; then
      die "nmcli을 찾을 수 없습니다. NetworkManager가 필요합니다."
    fi
    log "nmcli 실행 중..."
    if [[ -z "$pw" ]]; then
      nmcli dev wifi connect "$ssid"
    else
      nmcli dev wifi connect "$ssid" password "$pw"
    fi
    ok "연결 명령 완료."
  fi
}

cmd_from_url() {
  local url="$1"
  local json ssid pw label
  json=$(decode_share "$url")
  ssid=$(json_get "$json" s)
  pw=$(json_get "$json" p)
  label=$(json_get "$json" l)

  [[ -n "$label" ]] && log "Label: $label"
  cmd_connect "$ssid" "$pw"
}

# ============== entry ==============
main() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 0
  fi

  local arg1="$1"

  case "$arg1" in
    -h|--help|help)
      usage
      ;;
    -v|--version|version)
      printf 'wifi-snap %s\n' "$VERSION"
      ;;
    decode)
      shift
      (( $# >= 1 )) || die "URL이 필요합니다. 예: wifi-snap decode \"https://...?wifi=...\""
      cmd_decode "$1"
      ;;
    connect)
      shift
      (( $# >= 1 )) || die "SSID가 필요합니다. 예: wifi-snap connect \"카페\" \"비번\""
      cmd_connect "$1" "${2:-}"
      ;;
    http://*|https://*|wifi-snap://*)
      cmd_from_url "$arg1"
      ;;
    *)
      # 마지막 시도: wifi= 가 포함되어 있으면 URL로 취급
      if [[ "$arg1" == *wifi=* ]]; then
        cmd_from_url "$arg1"
      else
        err "알 수 없는 명령: $arg1"
        echo
        usage
        exit 1
      fi
      ;;
  esac
}

main "$@"
