import * as G from '../shared/game.js';
import { EVENTS, EVENT, BREAKDOWN } from './events-data.js';

export class ApiError extends Error {
  constructor(status, code, message = code) { super(message); this.status = status; this.code = code; }
}

const DAY = 86400e3;
const iso = (ms) => new Date(ms).toISOString();
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function createService({ storage, tg = null, cfg, clock = () => Date.now(), random = Math.random }) {
  const cache = new Map(); // id -> { row, dirty, touched }
  const locks = new Map();
  const rate = new Map();
  const lbCache = new Map();
  let botUsername = '';
  let timers = [];

  // Все изменения одного игрока идут строго по очереди.
  function withLock(id, fn) {
    const prev = locks.get(id) || Promise.resolve();
    const p = prev.catch(() => {}).then(fn);
    locks.set(id, p);
    p.catch(() => {}).finally(() => { if (locks.get(id) === p) locks.delete(id); });
    return p;
  }

  async function load(id) {
    let e = cache.get(id);
    if (!e) {
      const row = await storage.getUser(id);
      if (!row) return null;
      e = { row, dirty: false, touched: 0 };
      cache.set(id, e);
    }
    e.touched = clock();
    return e;
  }

  function syncDerived(row, now) {
    const s = row.state;
    row.total_earned = s.totalEarned;
    row.income = G.steadyIncome(s, now);
    row.badge = s.crown ? 'crown' : null;
  }

  async function persist(e) {
    const { id, created_at, ...patch } = e.row;
    e.dirty = false;
    try { await storage.updateUser(id, patch); } catch (err) { e.dirty = true; throw err; }
  }

  // Изменение состояния игрока: доначислить доход, выполнить fn, сохранить.
  function mutate(id, fn, { save = false } = {}) {
    return withLock(id, async () => {
      const e = await load(id);
      if (!e) throw new ApiError(404, 'no_user');
      const now = clock();
      G.accrue(e.row.state, now);
      const out = await fn(e.row, e.row.state, now);
      syncDerived(e.row, now);
      e.dirty = true;
      if (save) await persist(e);
      return out;
    });
  }

  function checkRate(id, now) {
    let r = rate.get(id);
    if (!r || now > r.reset) { r = { n: 0, reset: now + 10000 }; rate.set(id, r); }
    if (++r.n > 40) throw new ApiError(429, 'slow_down');
  }

  function touch(row, now) {
    row.last_seen = iso(now);
    row.notify_at = iso(now + G.offlineCapSec(row.state, now) * 1000);
  }

  function ensureEvent(s, now) {
    if (s.event && !EVENT[s.event.id]) s.event = null;
    if (s.event || !s.setup || now < s.nextEventAt) return;
    const pool = EVENTS.filter((e) => !s.seen.includes(e.id));
    // б/у аппарат ломается: примерно каждая третья ситуация
    const sc = s.setup.equip === 'used' && random() < 0.35 ? BREAKDOWN : (pool.length ? pool : EVENTS)[Math.floor(random() * (pool.length || EVENTS.length))];
    const order = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    s.event = { id: sc.id, order, hint: null };
    if (!sc.special) s.seen.push(sc.id);
    if (s.seen.length > 15) s.seen.shift();
  }

  function publicState(s) {
    const p = { ...s };
    delete p.seen;
    if (s.event) {
      const sc = EVENT[s.event.id];
      p.event = { id: sc.id, title: sc.title, text: sc.text, options: s.event.order.map((i) => sc.options[i].t), hint: s.event.hint };
    }
    return p;
  }

  const snapshot = (row, now) => ({ state: publicState(row.state), serverTime: now, me: { id: row.id, name: row.name, city: row.city } });

  function refLink(id) {
    if (cfg.appLink) return `${cfg.appLink}?startapp=ref_${id}`;
    if (botUsername) return `https://t.me/${botUsername}?start=ref_${id}`;
    return `${cfg.webappUrl || ''}/?sp=ref_${id}`;
  }

  const log = (userId, type, data) => storage.logEvent(userId, type, data).catch((e) => console.error('logEvent:', e.message));

  // Действие от клиента: лимит запросов, тапы, сама операция, события, реферальная награда.
  async function action(auth, body, fn, opts) {
    const id = auth.user.id;
    let payRef = null;
    const out = await mutate(id, async (row, s, now) => {
      checkRate(id, now);
      const taps = Math.floor(Number(body?.taps) || 0);
      if (taps > 0) {
        const allowed = Math.min(taps, Math.floor(((now - s.tapTs) / 1000) * G.MAX_TPS) + G.TAP_BURST);
        G.applyTaps(s, Math.max(0, allowed), now);
      }
      s.tapTs = now;
      touch(row, now);
      const res = (await fn(row, s, now)) || {};
      ensureEvent(s, now);
      if (s.ref.by && !s.ref.rewarded && G.totalLevels(s) >= G.REF_LEVELS_NEEDED + 1) {
        s.ref.rewarded = true;
        const amount = G.grantMinutes(s, G.REF_REWARD_MIN, now);
        G.addBoost(s, 'ref', 2, 3600e3, now, true);
        res.refBonus = { amount };
        payRef = { inviter: s.ref.by, name: row.name };
      }
      return { ...res, ...snapshot(row, now) };
    }, opts);
    if (payRef) rewardInviter(payRef.inviter, payRef.name).catch((e) => console.error('ref reward:', e.message));
    return out;
  }

  async function rewardInviter(inviterId, friendName) {
    let amount = 0;
    await mutate(inviterId, (row, s, now) => {
      s.ref.count += 1;
      amount = G.grantMinutes(s, G.REF_REWARD_MIN, now);
      G.addBoost(s, 'ref', 2, 3600e3, now, true);
    }, { save: true });
    log(inviterId, 'ref_reward', { friend: friendName });
    if (tg) await tg.sendMessage(inviterId, `🤝 <b>${esc(friendName || 'Твой друг')}</b> открыл свою шаурмичную по твоей ссылке!\nТебе начислено <b>${G.fmt(amount)} ${G.CURRENCY}</b> и доход ×2 на час.`, playButton()).catch(() => {});
  }

  const owned = (s, pid) => (pid === 'starter' && s.starter) || (pid === 'manager' && s.manager) || (pid === 'crown' && s.crown);

  function grantProduct(row, s, pid, now) {
    const p = G.PRODUCT[pid];
    if (!p) throw new Error('unknown product ' + pid);
    if (pid === 'starter') { s.starter = true; G.grantMinutes(s, 120, now); G.addBoost(s, 'stars2', 2, DAY, now, true); s.hints += 3; }
    else if (pid === 'boost2') G.addBoost(s, 'stars2', 2, DAY, now, true);
    else if (pid === 'manager') s.manager = true;
    else if (pid === 'vip30') s.vipUntil = Math.max(s.vipUntil, now) + 30 * DAY;
    else if (pid === 'skip4') G.grantMinutes(s, 240, now);
    else if (pid === 'hints5') s.hints += 5;
    else if (pid === 'crown') s.crown = true;
    row.stars_spent = (row.stars_spent || 0) + p.stars;
  }

  const playButton = (param = '') => (cfg.webappUrl ? { reply_markup: { inline_keyboard: [[{ text: '🌯 Играть', web_app: { url: cfg.webappUrl + (param ? `/?sp=${encodeURIComponent(param)}` : '/') } }]] } } : {});

  async function cached(key, ttl, fn) {
    const now = clock();
    const c = lbCache.get(key);
    if (c && now - c.at < ttl) return c.value;
    const value = await fn();
    lbCache.set(key, { at: now, value });
    return value;
  }

  // ---------------- API ----------------
  const api = {
    async state(auth, body) {
      const id = auth.user.id;
      const u = auth.user;
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Игрок';
      return withLock(id, async () => {
        const now = clock();
        checkRate(id, now);
        let e = await load(id);
        let isNew = false, offline = null;
        if (!e) {
          const s = G.newState(now);
          const raw = String(auth.startParam || body?.sp || '');
          const sp = /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : '';
          let source = sp ? sp.slice(0, 32) : null, referrer = null;
          const m = sp.match(/^ref_(\d{1,15})$/);
          if (m) {
            source = 'ref';
            const rid = Number(m[1]);
            if (rid !== id && (cache.has(rid) || (await storage.getUser(rid)))) { referrer = rid; s.ref.by = rid; }
          }
          const row = { id, name, username: u.username || null, lang: u.language_code || null, city: null, source, referrer_id: referrer,
            created_at: iso(now), last_seen: iso(now), total_earned: 0, income: 0, stars_spent: 0, badge: null, notify_at: null, state: s };
          syncDerived(row, now);
          await storage.insertUser(row);
          e = { row, dirty: false, touched: now };
          cache.set(id, e);
          isNew = true;
          log(id, 'register', { source });
        } else {
          const s = e.row.state;
          const away = now - s.ts;
          const r = G.accrue(s, now);
          if (away > 5 * 60e3) offline = { earned: r.earned, sec: r.sec, capped: r.capped };
          e.row.name = name; e.row.username = u.username || null;
        }
        const { row } = e, s = row.state;
        s.tapTs = now;
        touch(row, now);
        ensureEvent(s, now);
        const today = G.dayIndex(now);
        if (s.openDay !== today) { s.openDay = today; log(id, 'open', null); }
        syncDerived(row, now);
        await persist(e);
        return { isNew, offline, config: { dev: cfg.dev, refLink: refLink(id), support: cfg.supportContact }, ...snapshot(row, now) };
      });
    },

    sync: (auth, body) => action(auth, body, () => ({})),

    setup: (auth, body) => action(auth, body, (row, s, now) => {
      const r = G.applySetup(s, String(body.loc), String(body.equip), String(body.meat));
      if (!r.ok) throw new ApiError(400, r.reason);
      s.nextEventAt = now + G.FIRST_EVENT_MS;
      log(row.id, 'setup', s.setup);
    }, { save: true }),

    price: (auth, body) => action(auth, body, (row, s) => {
      if (!G.setPrice(s, body.price)) throw new ApiError(400, 'bad_price');
    }),

    buy: (auth, body) => action(auth, body, (row, s) => {
      const r = G.buy(s, String(body.biz), body.count === 'max' ? 'max' : Number(body.count));
      if (!r.ok) throw new ApiError(400, r.reason);
      return { bought: r.bought };
    }),

    prestige: (auth, body) => action(auth, body, (row, s) => {
      const r = G.doPrestige(s);
      if (!r.ok) throw new ApiError(400, 'not_enough');
      log(row.id, 'prestige', { points: r.points, total: s.franchise });
      return { prestige: { points: r.points } };
    }, { save: true }),

    'event/hint': (auth, body) => action(auth, body, (row, s, now) => {
      if (!s.event) throw new ApiError(400, 'no_event');
      if (s.event.hint == null) {
        if (!G.isVip(s, now)) {
          if (s.hints <= 0) throw new ApiError(402, 'no_hints');
          s.hints -= 1;
        }
        const sc = EVENT[s.event.id];
        s.event.hint = s.event.order.findIndex((i) => sc.options[i].q === 'best');
      }
    }, { save: true }),

    'event/choose': (auth, body) => action(auth, body, (row, s, now) => {
      if (!s.event) throw new ApiError(400, 'no_event');
      const i = Number(body.choice);
      if (![0, 1, 2].includes(i)) throw new ApiError(400, 'bad_choice');
      const sc = EVENT[s.event.id];
      const opt = sc.options[s.event.order[i]];
      let money = opt.money ? G.grantMinutes(s, opt.money, now) : 0;
      if (opt.cash) { const d = Math.max(-s.money, opt.cash); s.money += d; money += d; }
      if (opt.equip && s.setup) s.setup.equip = opt.equip;
      if (opt.mult) G.addBoost(s, 'ev:' + sc.id, opt.mult, opt.dur * 60e3, now);
      s.ev.total += 1;
      if (opt.q === 'best') { s.ev.best += 1; s.ev.streak += 1; s.ev.maxStreak = Math.max(s.ev.maxStreak, s.ev.streak); } else s.ev.streak = 0;
      s.event = null;
      const [a, b] = G.EVENT_GAP_MIN;
      s.nextEventAt = now + (a + random() * (b - a)) * 60e3;
      log(row.id, 'event', { id: sc.id, q: opt.q });
      return { result: { title: sc.title, q: opt.q, text: opt.r, money, mult: opt.mult, dur: opt.dur, best: sc.options.find((x) => x.q === 'best').t, streak: s.ev.streak } };
    }, { save: true }),

    daily: (auth, body) => action(auth, body, (row, s, now) => {
      const st = G.dailyStatus(s, now);
      if (!st.available) throw new ApiError(400, 'claimed');
      const amount = G.grantMinutes(s, st.minutes * (G.isVip(s, now) ? 2 : 1), now);
      const bonus = st.streak % 7 === 0;
      if (bonus) G.addBoost(s, 'daily', 2, 2 * 3600e3, now, true);
      s.daily = { day: G.dayIndex(now), streak: st.streak };
      log(row.id, 'daily', { streak: st.streak });
      return { daily: { streak: st.streak, amount, bonus } };
    }, { save: true }),

    city: (auth, body) => action(auth, body, (row) => {
      if (!G.CITIES.includes(body.city)) throw new ApiError(400, 'bad_city');
      row.city = body.city;
    }, { save: true }),

    invoice: (auth, body) => action(auth, body, async (row, s) => {
      const p = G.PRODUCT[body.product];
      if (!p) throw new ApiError(400, 'bad_product');
      if (p.once && owned(s, p.id)) throw new ApiError(400, 'owned');
      log(row.id, 'invoice', { product: p.id });
      if (cfg.dev || !tg) return { dev: true };
      const link = await tg.call('createInvoiceLink', {
        title: p.title, description: p.desc, payload: JSON.stringify({ u: row.id, p: p.id }),
        provider_token: '', currency: 'XTR', prices: [{ label: p.title, amount: p.stars }],
      });
      return { link };
    }),

    'dev/pay': (auth, body) => {
      if (!cfg.dev) throw new ApiError(404, 'not_found');
      const p = G.PRODUCT[body.product];
      if (!p) throw new ApiError(400, 'bad_product');
      return action(auth, body, async (row, s, now) => {
        if (p.once && owned(s, p.id)) throw new ApiError(400, 'owned');
        await storage.insertPurchase({ charge_id: `dev_${now}_${Math.floor(random() * 1e9)}`, user_id: row.id, product: p.id, stars: p.stars, created_at: iso(now) });
        grantProduct(row, s, p.id, now);
      }, { save: true });
    },

    async leaderboard(auth, body) {
      const e = await load(auth.user.id);
      if (!e) throw new ApiError(404, 'no_user');
      checkRate(auth.user.id, clock());
      const scope = body.scope;
      if (scope === 'cities') return { rows: await cached('cities', 30000, () => storage.cityTop(20)), myCity: e.row.city };
      const city = scope === 'city' ? e.row.city : null;
      if (scope === 'city' && !city) throw new ApiError(400, 'no_city');
      const rows = await cached('top:' + (city || ''), 30000, () => storage.top(city, 50));
      const total = e.row.state.totalEarned;
      return { rows, me: { id: e.row.id, rank: await storage.rank(total, city), total } };
    },

    async track(auth, body) {
      if (['share', 'invite', 'shop_open'].includes(body.type)) { checkRate(auth.user.id, clock()); log(auth.user.id, 'ui_' + body.type, null); }
      return { ok: true };
    },
  };

  // ---------------- бот ----------------
  async function onPreCheckout(q) {
    const answer = (ok, error_message) => tg.call('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok, ...(ok ? {} : { error_message }) });
    try {
      const pl = JSON.parse(q.invoice_payload);
      const p = G.PRODUCT[pl.p];
      if (!p || q.currency !== 'XTR' || q.total_amount !== p.stars || pl.u !== q.from.id) return answer(false, 'Товар недоступен. Открой магазин заново.');
      const e = await load(q.from.id);
      if (!e) return answer(false, 'Сначала открой игру.');
      if (p.once && owned(e.row.state, p.id)) return answer(false, 'Этот товар у тебя уже есть.');
      return answer(true);
    } catch { return answer(false, 'Не получилось проверить покупку. Попробуй ещё раз.'); }
  }

  async function onPaid(msg) {
    const sp = msg.successful_payment;
    const userId = msg.from.id;
    let pid;
    try { pid = JSON.parse(sp.invoice_payload).p; } catch { pid = null; }
    const p = G.PRODUCT[pid];
    const fresh = await storage.insertPurchase({ charge_id: sp.telegram_payment_charge_id, user_id: userId, product: String(pid), stars: sp.total_amount, created_at: iso(clock()) });
    if (!fresh) return; // этот платёж уже обработан
    if (!p) { console.error('PAYMENT WITHOUT PRODUCT', userId, sp.telegram_payment_charge_id); return; }
    try {
      await mutate(userId, (row, s, now) => grantProduct(row, s, p.id, now), { save: true });
    } catch (e) {
      // Деньги получены, товар не выдан: чинится вручную командой /grant <id> <товар>
      console.error(`GRANT FAILED user=${userId} product=${p.id} charge=${sp.telegram_payment_charge_id}:`, e.message);
      await tg.sendMessage(userId, 'Оплата получена, но товар не выдался автоматически. Напиши /paysupport — выдадим вручную или вернём звёзды.').catch(() => {});
      return;
    }
    log(userId, 'purchase', { product: p.id, stars: sp.total_amount });
    await tg.sendMessage(userId, `✅ Покупка активирована: <b>${esc(p.title)}</b>. Спасибо!`, playButton()).catch(() => {});
  }

  const TERMS = `<b>Условия</b>\n\n• Игровые тенге (${G.CURRENCY}) — виртуальная валюта внутри игры. Она не выводится и не обменивается на деньги, товары или Telegram Stars.\n• За Stars продаются только игровые улучшения. Что именно ты получаешь, написано на карточке товара до оплаты.\n• Вопросы по платежам и возвраты: /paysupport`;

  async function onMessage(msg) {
    if (msg.successful_payment) return onPaid(msg);
    const text = (msg.text || '').trim();
    if (!text.startsWith('/') || msg.chat?.type !== 'private') return;
    const [cmdRaw, ...args] = text.split(/\s+/);
    const cmd = cmdRaw.split('@')[0].toLowerCase();
    const chat = msg.chat.id;
    const isAdmin = cfg.adminIds.includes(msg.from.id);

    if (cmd === '/start') {
      const param = /^[A-Za-z0-9_-]{1,64}$/.test(args[0] || '') ? args[0] : '';
      return tg.sendMessage(chat, `🌯 <b>${G.GAME_TITLE}</b>\n\nМага пятнадцать лет стоит у гриля и делает лучший донер в городе. Ты хозяин, он мастер. Превратите ларёк у остановки в сеть по всему Казахстану. Точки зарабатывают игровые тенге, даже когда ты спишь.\n\nЖми «Играть» 👇`, playButton(param));
    }
    if (cmd === '/help') return tg.sendMessage(chat, 'Покупай точки, улучшай их, решай ситуации и продавай сеть ради очков франшизы.\n\n/terms — условия\n/paysupport — вопросы по оплате', playButton());
    if (cmd === '/terms') return tg.sendMessage(chat, TERMS);
    if (cmd === '/paysupport') return tg.sendMessage(chat, `Если покупка не пришла или ты хочешь вернуть звёзды, напиши${cfg.supportContact ? ' ' + esc(cfg.supportContact) : ' администратору'} и укажи свой ID: <code>${msg.from.id}</code>. Возврат делаем в течение 24 часов.`);
    if (!isAdmin) return;

    if (cmd === '/stats') {
      const st = await storage.stats();
      const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}% (${a}/${b})` : 'нет данных');
      const src = (st.sources || []).map((s) => `• ${esc(s.source)}: ${s.users} игр., ${s.payers} плат., ${s.stars}⭐`).join('\n');
      return tg.sendMessage(chat, `<b>Статистика</b>\nИгроков: ${st.users}\nНовых за 24ч: ${st.new_24h}\nАктивных за 24ч: ${st.dau}\nВернулись на 2-й день: ${pct(st.d1_returned, st.d1_cohort)}\nВернулись через 7 дней: ${pct(st.d7_returned, st.d7_cohort)}\nПлатящих: ${st.payers} (${st.users ? ((st.payers / st.users) * 100).toFixed(1) : 0}%)\nStars всего: ${st.stars}⭐\n\n<b>Источники</b>\n${src || '—'}`);
    }
    if (cmd === '/refund') {
      const pur = args[0] && (await storage.getPurchase(args[0]));
      if (!pur) return tg.sendMessage(chat, 'Формат: /refund &lt;charge_id&gt;. Платёж не найден.');
      if (pur.refunded) return tg.sendMessage(chat, 'Этот платёж уже возвращён.');
      await tg.call('refundStarPayment', { user_id: pur.user_id, telegram_payment_charge_id: pur.charge_id });
      await storage.setPurchaseRefunded(pur.charge_id);
      log(pur.user_id, 'refund', { product: pur.product, stars: pur.stars });
      return tg.sendMessage(chat, `Возвращено ${pur.stars}⭐ игроку ${pur.user_id} (${esc(pur.product)}). Товар в игре не отбирается автоматически.`);
    }
    if (cmd === '/grant') {
      const uid = Number(args[0]);
      if (!uid || !G.PRODUCT[args[1]]) return tg.sendMessage(chat, `Формат: /grant &lt;user_id&gt; &lt;товар&gt;\nТовары: ${G.PRODUCTS.map((p) => p.id).join(', ')}`);
      await mutate(uid, (row, s, now) => { grantProduct(row, s, args[1], now); row.stars_spent -= G.PRODUCT[args[1]].stars; }, { save: true });
      return tg.sendMessage(chat, `Выдано: ${args[1]} → ${uid}`);
    }
  }

  async function handleUpdate(u) {
    if (u.pre_checkout_query) return onPreCheckout(u.pre_checkout_query);
    if (u.message) return onMessage(u.message);
  }

  async function sendReminders() {
    if (!tg) return;
    const rows = await storage.dueReminders(iso(clock()), 25);
    for (const r of rows) {
      await tg.sendMessage(r.id, '🌯 <b>Касса полная!</b>\nТочки заработали максимум, пока тебя не было. Забери выручку, иначе новые деньги не копятся.', playButton()).catch(() => {});
    }
  }

  async function flushAll() {
    for (const e of cache.values()) if (e.dirty) await persist(e).catch((err) => console.error('save:', err.message));
  }

  return {
    api, handleUpdate, sendReminders, flushAll,
    setBotUsername(n) { botUsername = n; },
    start() {
      timers.push(setInterval(async () => {
        await flushAll();
        const now = clock();
        for (const [id, e] of cache) if (!e.dirty && now - e.touched > 10 * 60e3 && !locks.has(id)) cache.delete(id);
        for (const [id, r] of rate) if (now > r.reset) rate.delete(id);
      }, 15000));
      timers.push(setInterval(() => sendReminders().catch((e) => console.error('reminders:', e.message)), 60000));
      timers.forEach((t) => t.unref());
    },
    async stop() { timers.forEach(clearInterval); timers = []; await flushAll(); },
  };
}
