# wifi-snap installer (Windows PowerShell)
# Usage:
#   iwr -useb https://iq-agent-lab.github.io/iq-wifi-snap/cli/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$ScriptUrl = "https://raw.githubusercontent.com/iq-agent-lab/iq-wifi-snap/main/cli/wifi-snap.ps1"
$PagesFallback = "https://iq-agent-lab.github.io/iq-wifi-snap/cli/wifi-snap.ps1"

# 설치 디렉토리: %USERPROFILE%\bin (PATH에 자동 추가)
$InstallDir = Join-Path $env:USERPROFILE "bin"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

$TargetPath = Join-Path $InstallDir "wifi-snap.ps1"
$WrapperPath = Join-Path $InstallDir "wifi-snap.cmd"

Write-Host "● wifi-snap CLI 설치 중..." -ForegroundColor DarkYellow
Write-Host "  대상 디렉토리: $InstallDir"

try {
    Invoke-WebRequest -Uri $ScriptUrl -OutFile $TargetPath -UseBasicParsing
} catch {
    Write-Host "  GitHub raw 실패, Pages에서 재시도..." -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $PagesFallback -OutFile $TargetPath -UseBasicParsing
}

# .cmd wrapper로 wifi-snap만 쳐도 실행되게
$wrapper = @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wifi-snap.ps1" %*
"@
Set-Content -Path $WrapperPath -Value $wrapper -Encoding ASCII

Write-Host "✓ 설치 완료: $TargetPath" -ForegroundColor Green

# PATH 확인 + 추가 안내
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$InstallDir*") {
    Write-Host ""
    Write-Host "⚠ $InstallDir 가 PATH에 없습니다." -ForegroundColor Yellow
    Write-Host "   다음 명령으로 영구 추가 (관리자 권한 PowerShell):"
    Write-Host ""
    Write-Host "     [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$InstallDir', 'User')" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   추가 후 새 PowerShell 창에서 사용 가능."
}

Write-Host ""
Write-Host "다음 명령으로 시작:"
Write-Host "  wifi-snap help" -ForegroundColor Cyan
