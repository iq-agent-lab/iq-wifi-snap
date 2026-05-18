# wifi-snap.ps1 - Windows companion for Wifi Snap (v0.8.0)
# Usage:
#   wifi-snap "https://iq-agent-lab.github.io/iq-wifi-snap/?wifi=..."
#   wifi-snap connect "Starbucks" "passw0rd"
#   wifi-snap decode "https://...?wifi=..."

param(
    [Parameter(Position=0)]
    [string]$Command = "",
    [Parameter(Position=1)]
    [string]$Arg1 = "",
    [Parameter(Position=2)]
    [string]$Arg2 = ""
)

$Version = "0.11.0"
$RepoUrl = "https://github.com/iq-agent-lab/iq-wifi-snap"

function Show-Usage {
    @"
wifi-snap CLI v$Version
  Companion for Wifi Snap - apply extracted WiFi to this machine.

USAGE
  wifi-snap <share-url>             공유 URL 디코드 후 연결
  wifi-snap connect <ssid> [pw]     SSID/PW 직접 지정해 연결
  wifi-snap decode <share-url>      디코드만 (연결 안 함)
  wifi-snap version                 버전 표시
  wifi-snap help                    이 도움말

NOTES
  netsh wlan은 일반 권한으로 가능합니다.
  관리자 권한 PowerShell이 필요한 경우 우클릭 -> '관리자 권한으로 실행'.

LEARN MORE
  $RepoUrl
"@
}

function Decode-B64 {
    param([string]$EncodedInput)
    $s = $EncodedInput.Replace('-', '+').Replace('_', '/')
    while ($s.Length % 4 -ne 0) { $s += '=' }
    try {
        return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s))
    } catch {
        throw "base64 디코드 실패. URL이 올바른가요?"
    }
}

function Get-Payload {
    param([string]$Url)
    if ($Url -match 'wifi=([^&#]+)') {
        return $matches[1]
    }
    throw "URL에서 wifi 파라미터를 찾지 못했습니다."
}

function Get-JsonValue {
    param([string]$Json, [string]$Key)
    $pattern = '"' + [Regex]::Escape($Key) + '"\s*:\s*"([^"]*)"'
    if ($Json -match $pattern) {
        return $matches[1]
    }
    return ""
}

function Decode-Share {
    param([string]$Url)
    $payload = Get-Payload $Url
    return Decode-B64 $payload
}

function Connect-Wifi {
    param([string]$Ssid, [string]$Password)

    if (-not $Ssid) { throw "SSID가 비어있습니다." }

    Write-Host "● Connecting to: $Ssid" -ForegroundColor Cyan

    # XML escape
    $ssidEsc = $Ssid -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
    $pwEsc = if ($Password) {
        $Password -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
    } else { '' }

    if ($Password) {
        $auth = 'WPA2PSK'
        $enc = 'AES'
        $sharedKey = "<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$pwEsc</keyMaterial></sharedKey>"
    } else {
        $auth = 'open'
        $enc = 'none'
        $sharedKey = ''
    }

    $xml = @"
<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>$ssidEsc</name>
  <SSIDConfig><SSID><name>$ssidEsc</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    <authEncryption><authentication>$auth</authentication><encryption>$enc</encryption><useOneX>false</useOneX></authEncryption>
    $sharedKey
  </security></MSM>
</WLANProfile>
"@

    $tmp = Join-Path $env:TEMP "wifi-snap-profile.xml"
    $xml | Out-File -FilePath $tmp -Encoding ASCII -Force

    try {
        $addOut = netsh wlan add profile filename="$tmp" 2>&1
        Write-Host $addOut
        $connOut = netsh wlan connect name="$Ssid" 2>&1
        Write-Host $connOut
        Write-Host "✓ 연결 명령 완료." -ForegroundColor Green
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

function Cmd-Decode {
    param([string]$Url)
    $json = Decode-Share $Url
    $ssid = Get-JsonValue $json 's'
    $pw = Get-JsonValue $json 'p'
    $sec = Get-JsonValue $json 't'
    $label = Get-JsonValue $json 'l'

    if (-not $ssid) { throw "디코드된 데이터에 SSID가 없습니다." }

    Write-Host "✓ 디코드 완료" -ForegroundColor Green
    Write-Host ("  SSID     {0}" -f $ssid)
    Write-Host ("  PW       {0}" -f $(if ($pw) { $pw } else { "(없음)" }))
    Write-Host ("  Security {0}" -f $(if ($sec) { $sec } else { "WPA" }))
    if ($label) { Write-Host ("  Label    {0}" -f $label) }
}

function Cmd-FromUrl {
    param([string]$Url)
    $json = Decode-Share $Url
    $ssid = Get-JsonValue $json 's'
    $pw = Get-JsonValue $json 'p'
    $label = Get-JsonValue $json 'l'
    if ($label) { Write-Host "● Label: $label" -ForegroundColor Cyan }
    Connect-Wifi -Ssid $ssid -Password $pw
}

# ============== entry ==============

try {
    switch -Regex ($Command) {
        '^$|^(-h|--help|help)$'             { Show-Usage; break }
        '^(-v|--version|version)$'          { Write-Host "wifi-snap $Version"; break }
        '^decode$'                          {
            if (-not $Arg1) { throw "URL이 필요합니다." }
            Cmd-Decode $Arg1; break
        }
        '^connect$'                         {
            if (-not $Arg1) { throw "SSID가 필요합니다." }
            Connect-Wifi -Ssid $Arg1 -Password $Arg2; break
        }
        '^(https?|wifi-snap)://' { Cmd-FromUrl $Command; break }
        default {
            if ($Command -match 'wifi=') {
                Cmd-FromUrl $Command
            } else {
                Write-Host "✗ 알 수 없는 명령: $Command" -ForegroundColor Red
                Write-Host ""
                Show-Usage
                exit 1
            }
        }
    }
} catch {
    Write-Host "✗ $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
