// Минимальный клиент Telegram Bot API на fetch + long polling.
export function createTelegram(token) {
  const base = `https://api.telegram.org/bot${token}/`;
  let running = false;

  async function call(method, params = {}, timeoutMs = 15000) {
    const r = await fetch(base + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params), signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
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
        const updates = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query'] }, 40000);
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
