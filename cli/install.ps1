# wifi-snap installer (Windows PowerShell) v0.11
# Usage:
#   iwr -useb https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$ScriptUrl = "https://raw.githubusercontent.com/iq-agent-lab/iq-wifi-snap/main/cli/wifi-snap.ps1"
$PagesFallback = "https://iq-agent-lab.github.io/iq-wifi-snap/cli/wifi-snap.ps1"

Write-Host "● wifi-snap CLI v0.11 설치 중..." -ForegroundColor DarkYellow
Write-Host ""

# ============================================================
# 1) CLI binary
# ============================================================
$InstallDir = Join-Path $env:USERPROFILE "bin"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

$TargetPath = Join-Path $InstallDir "wifi-snap.ps1"
$WrapperPath = Join-Path $InstallDir "wifi-snap.cmd"

Write-Host "[1/2] CLI 바이너리 → $TargetPath" -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri $ScriptUrl -OutFile $TargetPath -UseBasicParsing
} catch {
    Write-Host "  GitHub raw 실패, Pages에서 재시도..." -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $PagesFallback -OutFile $TargetPath -UseBasicParsing
}

# .cmd wrapper
$wrapper = @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wifi-snap.ps1" %*
"@
Set-Content -Path $WrapperPath -Value $wrapper -Encoding ASCII

Write-Host "  ✓ 완료" -ForegroundColor Green
Write-Host ""

# ============================================================
# 2) URL scheme handler (wifi-snap://)
# ============================================================
Write-Host "[2/2] URL 스킴 핸들러 등록 (wifi-snap://)" -ForegroundColor Cyan

$schemeKey = "Registry::HKEY_CURRENT_USER\Software\Classes\wifi-snap"
$cmdKey    = "$schemeKey\shell\open\command"

try {
    if (-not (Test-Path $schemeKey)) {
        New-Item -Path $schemeKey -Force | Out-Null
    }
    Set-ItemProperty -Path $schemeKey -Name "(Default)" -Value "URL:Wifi Snap Protocol"
    Set-ItemProperty -Path $schemeKey -Name "URL Protocol" -Value ""

    if (-not (Test-Path $cmdKey)) {
        New-Item -Path $cmdKey -Force | Out-Null
    }

    # PowerShell을 통해 wifi-snap.ps1 실행, 결과 보이도록 NoExit 옵션
    $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File `"$TargetPath`" `"%1`""
    Set-ItemProperty -Path $cmdKey -Name "(Default)" -Value $cmd

    Write-Host "  ✓ Windows 레지스트리 등록 완료" -ForegroundColor Green
    Write-Host "  wifi-snap:// 링크 클릭 → PowerShell 창에서 자동 실행" -ForegroundColor DarkGray
} catch {
    Write-Host "  ✗ 레지스트리 등록 실패: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# ============================================================
# PATH 확인
# ============================================================
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$InstallDir*") {
    Write-Host "⚠ $InstallDir 가 PATH에 없습니다." -ForegroundColor Yellow
    Write-Host "   다음 명령으로 영구 추가:"
    Write-Host ""
    Write-Host "     [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$InstallDir', 'User')" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "완료. 다음 명령으로 시작:" -ForegroundColor White
Write-Host "  wifi-snap help" -ForegroundColor Cyan
Write-Host ""
Write-Host "또는 wifi-snap:// 링크를 어디서든 클릭하면 자동 실행됩니다."
