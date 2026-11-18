import https from 'node:https';

// Минимальный клиент Telegram Bot API на fetch + long polling.
export function createTelegram(token) {
  const base = `https://api.telegram.org/bot${token}/`;
  let running = false;

  // Запрос к Bot API через https с принудительным IPv4: на некоторых хостингах IPv6 до Telegram зависает.
  function post(method, params, timeoutMs) {
    const body = Buffer.from(JSON.stringify(params));
    return new Promise((resolve, reject) => {
      const req = https.request(base + method, {
        method: 'POST', family: 4, timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout ' + timeoutMs + ' мс')));
      req.on('error', reject);
      req.end(body);
    });
  }

  async function call(method, params = {}, timeoutMs = 15000) {
    const r = await post(method, params, timeoutMs);
    let j;
    try { j = JSON.parse(r.text); } catch { j = { ok: false, description: `HTTP ${r.status}` }; }
    if (!j.ok) {
      const e = new Error(`telegram ${method}: ${j.description}`);
      e.code = j.error_code;
      throw e;
    }
    return j.result;
  }

  async function startPolling(onUpdate) {
    running = true;
    await call('deleteWebhook', {}).catch(() => {});
    let offset = 0;
    while (running) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query', 'callback_query'] }, 40000);
        for (const u of updates) {
          offset = u.update_id + 1;
          try { await onUpdate(u); } catch (e) { console.error('update error:', e.message); }
        }
      } catch (e) {
        if (running) { console.error('polling:', e.message); await new Promise((r) => setTimeout(r, 3000)); }
      }
    }
  }

  return {
    call,
    startPolling,
    stop() { running = false; },
    sendMessage: (chat_id, text, extra = {}) => call('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra }),
  };
}
