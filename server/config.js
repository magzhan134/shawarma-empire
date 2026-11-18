import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Мини-загрузчик .env без зависимостей.
export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function readConfig(env = process.env) {
  const botToken = env.BOT_TOKEN || '';
  return {
    port: Number(env.PORT || 3000),
    botToken,
    dev: !botToken, // без токена сервер работает в режиме разработки: вход без Telegram, покупки понарошку
    webappUrl: (env.WEBAPP_URL || '').replace(/\/$/, ''),
    appLink: (env.APP_LINK || '').replace(/\/$/, ''), // https://t.me/<бот>/<приложение>, если создано через /newapp
    adminIds: (env.ADMIN_IDS || '').split(',').map((s) => Number(s.trim())).filter(Boolean),
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_SERVICE_KEY || '',
    supportContact: env.SUPPORT_CONTACT || '',
    // webhook: Telegram сам присылает обновления и будит уснувший сервер (нужно для бесплатных хостингов).
    // polling: сервер сам опрашивает Telegram (удобно локально).
    tgMode: (env.TG_MODE || 'polling').toLowerCase() === 'webhook' ? 'webhook' : 'polling',
    webhookSecret: botToken ? crypto.createHash('sha256').update('webhook:' + botToken).digest('hex').slice(0, 48) : '',
  };
}
