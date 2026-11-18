// Хранилище в Supabase через REST (PostgREST), без SDK. Нужен service-ключ: он только на сервере.
export function createSupabaseStorage({ url, key }) {
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1';
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function req(method, path, { body, headers } = {}) {
    const r = await fetch(base + path, { method, headers: { ...H, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) {
      const e = new Error(`supabase ${method} ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
      e.status = r.status;
      throw e;
    }
    return r;
  }
  const json = async (r) => (r.status === 204 ? null : r.json());
  const cityQ = (city) => (city ? `&city=eq.${encodeURIComponent(city)}` : '');

  return {
    kind: 'supabase',
    async getUser(id) {
      const rows = await json(await req('GET', `/users?id=eq.${id}&select=*`));
      return rows[0] || null;
    },
    async insertUser(row) { await req('POST', '/users', { body: row, headers: { Prefer: 'return=minimal' } }); },
    async updateUser(id, patch) { await req('PATCH', `/users?id=eq.${id}`, { body: patch, headers: { Prefer: 'return=minimal' } }); },
    async top(city, limit) {
      return json(await req('GET', `/users?select=id,name,city,total_earned,badge&order=total_earned.desc&limit=${limit}${cityQ(city)}`));
    },
    async rank(total, city) {
      const r = await req('GET', `/users?select=id&total_earned=gt.${total}&limit=1${cityQ(city)}`, { headers: { Prefer: 'count=exact' } });
      const count = Number((r.headers.get('content-range') || '').split('/')[1]);
      return (Number.isFinite(count) ? count : 0) + 1;
    },
    async cityTop(limit) {
      return json(await req('GET', `/city_leaderboard?select=city,total,players&order=total.desc&limit=${limit}`));
    },
    async insertPurchase(p) {
      try {
        await req('POST', '/purchases', { body: p, headers: { Prefer: 'return=minimal' } });
        return true;
      } catch (e) {
        if (e.status === 409) return false; // такой платёж уже записан
        throw e;
      }
    },
    async listUserIds(after, limit) {
      return (await json(await req('GET', `/users?select=id&id=gt.${Number(after) || 0}&order=id.asc&limit=${limit}`))).map((r) => Number(r.id));
    },
    async recentPurchases(limit) {
      return json(await req('GET', `/purchases?select=*&order=created_at.desc&limit=${limit}`));
    },
    async getPurchase(chargeId) {
      const rows = await json(await req('GET', `/purchases?charge_id=eq.${encodeURIComponent(chargeId)}&select=*`));
      return rows[0] || null;
    },
    async setPurchaseRefunded(chargeId) {
      await req('PATCH', `/purchases?charge_id=eq.${encodeURIComponent(chargeId)}`, { body: { refunded: true }, headers: { Prefer: 'return=minimal' } });
    },
    async logEvent(user_id, type, data = null) {
      await req('POST', '/events', { body: { user_id, type, data }, headers: { Prefer: 'return=minimal' } });
    },
    async dueReminders(nowIso, limit) {
      const rows = await json(await req('GET', `/users?select=id,name&notify_at=lte.${encodeURIComponent(nowIso)}&order=notify_at.asc&limit=${limit}`));
      if (rows.length) await req('PATCH', `/users?id=in.(${rows.map((r) => r.id).join(',')})`, { body: { notify_at: null }, headers: { Prefer: 'return=minimal' } });
      return rows;
    },
    async stats() { return json(await req('POST', '/rpc/admin_stats', { body: {} })); },
    async close() {},
  };
}
