// lib/wifi.js
// WiFi QR string + OS-specific connection commands

/**
 * WiFi QR string format (IEEE 802.11 / 안드로이드·iOS 공식 지원)
 *   WIFI:T:<auth>;S:<ssid>;P:<password>;H:<hidden>;;
 */
export function wifiQRString({ ssid, password, security = 'WPA', hidden = false }) {
  const esc = (s) => String(s).replace(/([\\;,":])/g, '\\$1');
  const sec = security === 'nopass' ? 'nopass' : security;
  let s = `WIFI:T:${sec};S:${esc(ssid)};`;
  if (sec !== 'nopass') s += `P:${esc(password)};`;
  if (hidden) s += `H:true;`;
  s += `;`;
  return s;
}

/* ============ macOS ============ */
export function macosCommand({ ssid, password, iface = 'en0' }) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return `networksetup -setairportnetwork ${iface} ${q(ssid)} ${q(password)}`;
}

/* ============ Linux (NetworkManager) ============ */
export function linuxCommand({ ssid, password }) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  if (!password) {
    return `nmcli dev wifi connect ${q(ssid)}`;
  }
  return `nmcli dev wifi connect ${q(ssid)} password ${q(password)}`;
}

/* ============ Windows (PowerShell + netsh) ============ */
export function windowsCommand({ ssid, password, security = 'WPA' }) {
  // Map to netsh auth string
  const authMap = { WPA: 'WPA2PSK', WEP: 'open', nopass: 'open' };
  const auth = authMap[security] || 'WPA2PSK';
  const enc = auth === 'open' ? 'none' : 'AES';

  // XML uses & escapes, PowerShell here-string preserves verbatim
  const escXml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const sharedKey =
    auth === 'open'
      ? ''
      : `<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${escXml(password)}</keyMaterial></sharedKey>`;

  return `# PowerShell (관리자)
$xml = @'
<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escXml(ssid)}</name>
  <SSIDConfig><SSID><name>${escXml(ssid)}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    <authEncryption><authentication>${auth}</authentication><encryption>${enc}</encryption><useOneX>false</useOneX></authEncryption>
    ${sharedKey}
  </security></MSM>
</WLANProfile>
'@
$tmp = "$env:TEMP\\iq-wifi-snap.xml"
$xml | Out-File -FilePath $tmp -Encoding ASCII
netsh wlan add profile filename="$tmp"
netsh wlan connect name="${ssid}"
Remove-Item $tmp`;
}
