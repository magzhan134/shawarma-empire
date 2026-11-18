import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadEnv, readConfig } from './config.js';
import { verifyInitData } from './auth.js';
import { createService, ApiError } from './game-service.js';
import { createMemoryStorage } from './storage/memory.js';
import { createSupabaseStorage } from './storage/supabase.js';
import { createTelegram } from './telegram.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  const baseDir = rel.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
  const file = path.normalize(path.join(baseDir, rel));
  if (!file.startsWith(baseDir + path.sep) || (baseDir === ROOT && !file.startsWith(path.join(ROOT, 'shared') + path.sep))) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  });
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new ApiError(413, 'too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new ApiError(400, 'bad_json')); } });
    req.on('error', reject);
  });
}

export async function createApp({ cfg, storage, tg = null, clock, random } = {}) {
  const service = createService({ storage, tg, cfg, clock, random });

  function authenticate(req) {
    if (cfg.dev) {
      const id = Number(req.headers['x-dev-user']);
      if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(401, 'dev_user_required');
      return { user: { id, first_name: decodeURIComponent(req.headers['x-dev-name'] || '') || `Тестер ${id}` }, startParam: '' };
    }
    const auth = verifyInitData(req.headers['x-init-data'], cfg.botToken);
    if (!auth) throw new ApiError(401, 'bad_init_data');
    return auth;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') { res.writeHead(200).end('ok'); return; }
    if (url.pathname === '/tg/webhook') {
      if (req.method !== 'POST' || !cfg.webhookSecret || req.headers['x-telegram-bot-api-secret-token'] !== cfg.webhookSecret) { res.writeHead(403).end(); return; }
      let update;
      try { update = await readBody(req, 1024 * 1024); } catch { res.writeHead(400).end(); return; }
      try { await service.handleUpdate(update); } catch (e) { console.error('webhook update:', e.message); }
      res.writeHead(200).end('ok'); // всегда 200, иначе Telegram будет повторять это обновление
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      return serveStatic(req, res, url.pathname);
    }
    const send = (status, obj) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
    try {
      const handler = service.api[url.pathname.slice(5)];
      if (req.method !== 'POST' || !Object.hasOwn(service.api, url.pathname.slice(5))) throw new ApiError(404, 'not_found');
      const auth = authenticate(req);
      const body = await readBody(req);
      send(200, await handler(auth, body || {}));
    } catch (e) {
      if (e instanceof ApiError) send(e.status, { error: e.code });
      else { console.error('api error:', e); send(500, { error: 'server' }); }
    }
  });

  return { server, service };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(name, fn) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (e.code === 401 || e.code === 404) throw new Error(`${name}: неверный BOT_TOKEN (${e.message})`);
      const wait = Math.min(60, 5 * i);
      console.error(`${name}: попытка ${i} не удалась (${e.message}), повтор через ${wait} с`);
      await sleep(wait * 1000);
    }
  }
}
async function setupTelegram(tg, cfg, service) {
  const me = await retry('Telegram getMe', () => tg.call('getMe', {}, 30000));
  service.setBotUsername(me.username);
  if (cfg.tgMode === 'webhook') {
    await retry('Telegram setWebhook', () => tg.call('setWebhook', { url: cfg.webappUrl + '/tg/webhook', secret_token: cfg.webhookSecret, allowed_updates: ['message', 'pre_checkout_query'] }, 30000));
  }
  if (cfg.webappUrl) await tg.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: cfg.webappUrl + '/' } } }, 30000).catch((e) => console.error('menu button:', e.message));
  else console.warn('WEBAPP_URL не задан: кнопка «Играть» в боте не появится.');
  if (cfg.tgMode === 'polling') tg.startPolling(service.handleUpdate);
  console.log(`Бот @${me.username} запущен (${cfg.tgMode === 'webhook' ? 'вебхук' : 'опрос'})`);
}

async function main() {
  loadEnv();
  const cfg = readConfig();
  const storage = cfg.supabaseUrl && cfg.supabaseKey
    ? createSupabaseStorage({ url: cfg.supabaseUrl, key: cfg.supabaseKey })
    : createMemoryStorage({ file: path.join(ROOT, 'data', 'dev-db.json') });
  const tg = cfg.botToken ? createTelegram(cfg.botToken) : null;
  const { server, service } = await createApp({ cfg, storage, tg });

  // Сначала поднимаем HTTP-сервер (Render проверяет, что порт открыт), потом подключаем Telegram с повторами.
  service.start();
  server.listen(cfg.port, () => {
    console.log(`Сервер: http://localhost:${cfg.port}  | база: ${storage.kind}${cfg.dev ? '  | РЕЖИМ РАЗРАБОТКИ (без Telegram, покупки понарошку)' : ''}`);
    if (!cfg.dev && storage.kind === 'memory') console.warn('ВНИМАНИЕ: Supabase не настроен, данные лежат в файле data/dev-db.json.');
  });

  if (tg) {
    if (cfg.tgMode === 'webhook' && !cfg.webappUrl) {
      console.error('ОШИБКА: для TG_MODE=webhook нужен WEBAPP_URL. Впиши адрес сервиса в Environment и перезапусти.');
    } else {
      setupTelegram(tg, cfg, service).catch((e) => console.error('Telegram:', e.message));
    }
  }

  const shutdown = async () => {
    tg?.stop();
    server.close();
    await service.stop();
    await storage.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
