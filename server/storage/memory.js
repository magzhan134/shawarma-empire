import fs from 'node:fs';
import path from 'node:path';

// Хранилище в памяти (с сохранением в JSON-файл). Для разработки и тестов; в бою используй Supabase.
export function createMemoryStorage({ file = null } = {}) {
  let users = new Map();
  let purchases = new Map();
  let events = [];
  let dirty = false;

  if (file && fs.existsSync(file)) {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      users = new Map(d.users.map((u) => [u.id, u]));
      purchases = new Map(d.purchases.map((p) => [p.charge_id, p]));
      events = d.events || [];
    } catch (e) { console.error('dev-db: не удалось прочитать файл, начинаю с пустой базы', e.message); }
  }
  function flush() {
    if (!file || !dirty) return;
    dirty = false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ users: [...users.values()], purchases: [...purchases.values()], events: events.slice(-5000) }));
  }
  const timer = file ? setInterval(flush, 5000) : null;
  timer?.unref();
  const clone = (x) => (x ? structuredClone(x) : null);
  const H = 3600e3;

  return {
    kind: 'memory',
    async getUser(id) { return clone(users.get(id)); },
    async insertUser(row) { users.set(row.id, clone(row)); dirty = true; },
    async updateUser(id, patch) { const u = users.get(id); if (u) { Object.assign(u, clone(patch)); dirty = true; } },
    async top(city, limit) {
      return [...users.values()].filter((u) => !city || u.city === city)
        .sort((a, b) => b.total_earned - a.total_earned).slice(0, limit)
        .map(({ id, name, city, total_earned, badge }) => ({ id, name, city, total_earned, badge }));
    },
    async rank(total, city) {
      let n = 1;
      for (const u of users.values()) if ((!city || u.city === city) && u.total_earned > total) n++;
      return n;
    },
    async cityTop(limit) {
      const m = new Map();
      for (const u of users.values()) {
        if (!u.city) continue;
        const c = m.get(u.city) || { city: u.city, total: 0, players: 0 };
        c.total += u.total_earned; c.players++; m.set(u.city, c);
      }
      return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
    },
    async insertPurchase(p) {
      if (purchases.has(p.charge_id)) return false;
      purchases.set(p.charge_id, { refunded: false, ...p }); dirty = true;
      return true;
    },
    async getPurchase(chargeId) { return clone(purchases.get(chargeId)); },
    async setPurchaseRefunded(chargeId) { const p = purchases.get(chargeId); if (p) { p.refunded = true; dirty = true; } },
    async logEvent(user_id, type, data = null) {
      events.push({ user_id, type, data, created_at: new Date().toISOString() });
      if (events.length > 50000) events.splice(0, 10000);
      dirty = true;
    },
    async dueReminders(nowIso, limit) {
      const out = [];
      for (const u of users.values()) {
        if (u.notify_at && u.notify_at <= nowIso) { out.push({ id: u.id, name: u.name }); u.notify_at = null; dirty = true; }
        if (out.length >= limit) break;
      }
      return out;
    },
    async stats(now = Date.now()) {
      const all = [...users.values()];
      const t = (iso) => Date.parse(iso);
      const cohort = (fromH, toH, backH) => {
        const c = all.filter((u) => t(u.created_at) <= now - fromH * H && t(u.created_at) > now - toH * H);
        return [c.length, c.filter((u) => t(u.last_seen) >= t(u.created_at) + backH * H).length];
      };
      const [d1c, d1r] = cohort(24, 48, 24);
      const [d7c, d7r] = cohort(168, 192, 168);
      const paid = [...purchases.values()].filter((p) => !p.refunded);
      const src = new Map();
      for (const u of all) {
        const k = u.source || 'organic';
        const s = src.get(k) || { source: k, users: 0, payers: 0, stars: 0 };
        s.users++; if (u.stars_spent > 0) s.payers++; s.stars += u.stars_spent || 0; src.set(k, s);
      }
      return {
        users: all.length,
        new_24h: all.filter((u) => t(u.created_at) > now - 24 * H).length,
        dau: all.filter((u) => t(u.last_seen) > now - 24 * H).length,
        d1_cohort: d1c, d1_returned: d1r, d7_cohort: d7c, d7_returned: d7r,
        payers: new Set(paid.map((p) => p.user_id)).size,
        stars: paid.reduce((a, p) => a + p.stars, 0),
        sources: [...src.values()].sort((a, b) => b.users - a.users).slice(0, 20),
      };
    },
    async close() { flush(); if (timer) clearInterval(timer); },
  };
}
