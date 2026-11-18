import crypto from 'node:crypto';

// Проверка подписи initData из Telegram Mini App.
// secret = HMAC_SHA256(key="WebAppData", botToken); hash = HMAC_SHA256(secret, data_check_string)
export function verifyInitData(initData, botToken, maxAgeSec = 86400, nowSec = Date.now() / 1000) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const pairs = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || nowSec - authDate > maxAgeSec) return null;
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return { user, startParam: params.get('start_param') || '' };
}

// Для тестов и локальной проверки: собирает корректно подписанную строку initData.
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const pairs = [...params].map(([k, v]) => `${k}=${v}`).sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}
