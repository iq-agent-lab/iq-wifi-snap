// lib/claude.js
// Anthropic API direct-browser client (BYO key)

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const EXTRACT_PROMPT = `이미지에서 WiFi 접속 정보를 추출해. 한국 카페·매장에서 흔한 형태:
- 라벨 예시: "WiFi", "와이파이", "네트워크", "네트워크명", "SSID", "ID", "아이디", "Network"
- 비밀번호 라벨: "비밀번호", "비번", "PW", "Password", "암호", "Pass"
- 비밀번호는 전화번호(010-xxxx-xxxx), 사업자번호, 4-12자리 숫자/영문 조합일 수 있음
- 라벨이 없고 두 줄로 SSID/PW만 나란히 적힌 경우도 있음
- 라벨과 값이 떨어져 있거나, 같은 줄에 콜론으로 붙어 있을 수 있음

규칙:
- SSID는 라벨을 빼고 정확히 값만
- 비밀번호는 공백 그대로(공백이 비밀번호의 일부일 수 있음)
- 보안 종류가 명시 안 됐으면 "WPA"로 추정
- 사진에 정보가 없거나 흐릿하면 ssid를 빈 문자열로

JSON으로만 답해. 마크다운 코드블록·설명문 일절 없이 JSON 객체 하나만:
{"ssid":"<문자열>","password":"<문자열>","security":"WPA|WEP|nopass","confidence":"high|medium|low","notes":"<애매한 부분 한 줄, 없으면 빈문자열>"}`;

export async function extractWifi({ apiKey, model, base64, mediaType }) {
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다');

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // strip code fences just in case
  const clean = text.replace(/```json\s*|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`응답 파싱 실패: ${clean.slice(0, 200)}`);
  }

  // sanity
  if (typeof parsed.ssid !== 'string') {
    throw new Error('응답에 ssid 필드가 없습니다');
  }
  parsed.password = parsed.password || '';
  parsed.security = parsed.security || 'WPA';
  parsed.confidence = parsed.confidence || 'medium';
  parsed.notes = parsed.notes || '';

  return parsed;
}
