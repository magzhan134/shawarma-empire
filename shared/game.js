// Общая игровая логика: один и тот же код считает на сервере (истина) и в клиенте (плавная картинка).
// Все деньги в игре — виртуальные «игровые тенге», они не выводятся и не обмениваются.

export const CURRENCY = '₸';
export const GAME_TITLE = 'Шаурма-империя';

export const FRANCHISE_BONUS = 0.1; // +10% к доходу за очко франшизы
export const PRESTIGE_K = 2.5e9; // очки = floor(sqrt(заработано за забег / K))
export const PRESTIGE_MIN = 10; // минимум очков, чтобы продать сеть
export const TAP_SHARE = 0.05; // тап = 5% дохода в секунду
export const TAP_MIN = 20;
export const START_CAPITAL = 500000; // стартовый капитал, ₸
export const BASE_PRICE = 1500; // обычная цена донера, ₸
export const PRICE_MIN = 500, PRICE_MAX = 8000, PRICE_STEP = 50;
export const REF_PROFIT = 900; // прибыль с донера, на которую рассчитан baseIncome точек
export const BRAND_STEP = 0.03; // каждая новая открытая точка поднимает «честную» цену на 3%
export const FLOOR_PER_MIN = 6000; // минимальная «минута дохода» для наград
export const MAX_TPS = 15; // сервер не засчитает больше тапов в секунду
export const TAP_BURST = 40;
export const VIP_MULT = 1.5;
export const OFFLINE_CAP = { base: 2 * 3600, manager: 12 * 3600, vip: 24 * 3600 };
export const FIRST_EVENT_MS = 3 * 60 * 1000;
export const EVENT_GAP_MIN = [60, 120]; // следующая ситуация через 60–120 минут
export const DAILY_MINUTES = [10, 15, 20, 30, 45, 60, 120]; // награда = минуты дохода
export const REF_REWARD_MIN = 30; // минут дохода обоим за приглашение
export const REF_LEVELS_NEEDED = 10; // друг должен купить 10 уровней, чтобы награда выдалась
export const TZ_OFFSET_H = 5; // сутки считаем по времени Казахстана

export const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400];

export const BUSINESSES = [
  { id: 'kiosk', name: 'Ларёк Маги', emoji: '🌯', baseCost: 2500, growth: 1.07, baseIncome: 100 },
  { id: 'mall', name: 'Точка в ТРЦ', emoji: '🏬', baseCost: 50000, growth: 1.1, baseIncome: 1000 },
  { id: 'cafe', name: 'Кафе с залом', emoji: '☕', baseCost: 625000, growth: 1.11, baseIncome: 6250 },
  { id: 'delivery', name: 'Служба доставки', emoji: '🛵', baseCost: 7.5e6, growth: 1.12, baseIncome: 37500 },
  { id: 'restaurant', name: 'Ресторан на Арбате', emoji: '🍽️', baseCost: 100e6, growth: 1.12, baseIncome: 250000 },
  { id: 'factory', name: 'Цех лаваша и соусов', emoji: '🏭', baseCost: 1.25e9, growth: 1.13, baseIncome: 1.625e6 },
  { id: 'cities', name: 'Сеть по городам', emoji: '🚚', baseCost: 18.75e9, growth: 1.13, baseIncome: 12.5e6 },
  { id: 'world', name: 'Международная франшиза', emoji: '🌍', baseCost: 300e9, growth: 1.14, baseIncome: 100e6 },
];

// Стартовый опрос: на что потратить капитал. traffic — поток клиентов, fair — какую цену люди считают честной.
export const LOCATIONS = [
  { id: 'bus', emoji: '🚏', name: 'Остановка в спальном районе', cost: 80000, traffic: 1, fair: 1, desc: 'Стабильный поток и обычные цены.' },
  { id: 'uni', emoji: '🎓', name: 'У университета', cost: 160000, traffic: 1.3, fair: 0.85, desc: 'Толпы студентов, но дорого им не продашь.' },
  { id: 'center', emoji: '🏙️', name: 'Центр города', cost: 300000, traffic: 1.05, fair: 1.15, desc: 'Офисы и туристы. Готовы платить больше.' },
];
export const EQUIPMENT = [
  { id: 'used', emoji: '🔧', name: 'Б/у аппарат с рук', cost: 60000, speed: 0.9, desc: 'Дёшево, но может сломаться в любой момент.' },
  { id: 'new', emoji: '✨', name: 'Новый электрогриль', cost: 200000, speed: 1, desc: 'Надёжный, с гарантией. Не ломается.' },
  { id: 'pro', emoji: '🔥', name: 'Гриль на два вертела', cost: 340000, speed: 1.25, desc: 'Вдвое больше мяса, очередь идёт быстрее.' },
];
export const MEATS = [
  { id: 'chicken', emoji: '🐔', name: 'Курица', cost: 0, unit: 500, fair: 0.95, desc: 'Себестоимость донера 500 ₸. Привычный вкус.' },
  { id: 'mix', emoji: '🥙', name: 'Курица и говядина', cost: 0, unit: 700, fair: 1.08, desc: 'Себестоимость 700 ₸. За такой платят чуть больше.' },
  { id: 'beef', emoji: '🥩', name: 'Говядина', cost: 0, unit: 1000, fair: 1.2, desc: 'Себестоимость 1000 ₸. Дорогой донер для тех, кто ценит.' },
];
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const LOC = byId(LOCATIONS), EQ = byId(EQUIPMENT), MEAT = byId(MEATS);
export const BIZ = Object.fromEntries(BUSINESSES.map((b, i) => [b.id, { ...b, idx: i }]));

export const CITIES = [
  'Алматы', 'Астана', 'Шымкент', 'Караганда', 'Актобе', 'Тараз', 'Павлодар', 'Усть-Каменогорск',
  'Семей', 'Атырау', 'Костанай', 'Кызылорда', 'Уральск', 'Петропавловск', 'Актау', 'Туркестан',
  'Кокшетау', 'Талдыкорган', 'Другой город',
];

// Товары за Telegram Stars. Никакой случайности: игрок всегда видит, что покупает.
export const PRODUCTS = [
  { id: 'starter', stars: 25, once: true, emoji: '🎁', title: 'Стартовый набор', desc: 'Выручка за 2 часа сразу, доход ×2 на 24 часа и 3 совета консультанта. Один раз.' },
  { id: 'boost2', stars: 25, emoji: '🚀', title: 'Доход ×2 на 24 часа', desc: 'Все точки приносят вдвое больше. Время складывается.' },
  { id: 'manager', stars: 50, once: true, emoji: '🧑‍💼', title: 'Управляющий', desc: 'Касса копит выручку 12 часов вместо 2, пока тебя нет. Навсегда.' },
  { id: 'vip30', stars: 199, emoji: '👑', title: 'VIP на 30 дней', desc: 'Доход ×1,5, касса на 24 часа, бесплатные советы, двойная ежедневная награда.' },
  { id: 'skip4', stars: 15, emoji: '⏩', title: 'Перемотка на 4 часа', desc: 'Мгновенно получи выручку за 4 часа работы сети.' },
  { id: 'hints5', stars: 20, emoji: '💡', title: '5 советов консультанта', desc: 'Консультант подсветит лучшее решение в ситуации.' },
  { id: 'crown', stars: 100, once: true, emoji: '🏆', title: 'Золотая корона', desc: 'Корона рядом с именем в рейтинге. Навсегда.' },
];
export const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// ---------- форматирование ----------
const UNITS = [[1e33, 'дец'], [1e30, 'нон'], [1e27, 'окт'], [1e24, 'септ'], [1e21, 'секст'], [1e18, 'квнт'], [1e15, 'квдр'], [1e12, 'трлн'], [1e9, 'млрд'], [1e6, 'млн'], [1e3, 'тыс']];
export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a >= 1e36) return n.toExponential(2).replace('.', ',').replace('e+', 'e');
  if (a < 1000) return String(Math.floor(n));
  for (const [v, s] of UNITS) {
    if (a >= v) {
      const x = n / v;
      const d = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2;
      const p = 10 ** d;
      return (Math.floor(x * p) / p).toFixed(d).replace('.', ',') + ' ' + s;
    }
  }
  return String(Math.floor(n));
}
export function fmtRate(n) {
  return n < 10 ? (Math.floor(n * 10) / 10).toFixed(1).replace('.', ',') : fmt(n);
}
export function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${s} с`;
  return `${s} с`;
}

// ---------- состояние ----------
export function newState(now) {
  return {
    v: 2, money: START_CAPITAL, setup: null, price: BASE_PRICE, runEarned: 0, totalEarned: 0, ts: now, tapTs: now, taps: 0,
    biz: { kiosk: 1 }, franchise: 0, prestiges: 0,
    boosts: [], vipUntil: 0, manager: false, starter: false, crown: false, hints: 1,
    event: null, nextEventAt: now + FIRST_EVENT_MS, seen: [],
    ev: { total: 0, best: 0, streak: 0, maxStreak: 0 },
    daily: { day: 0, streak: 0 },
    ref: { by: null, rewarded: false, count: 0 },
    cust: { day: dayIndex(now), n: 0, total: 0 },
    createdAt: now, openDay: 0,
  };
}

export const lvl = (s, id) => s.biz[id] || 0;
export const totalLevels = (s) => BUSINESSES.reduce((a, b) => a + lvl(s, b.id), 0);
export const isUnlocked = (s, id) => BIZ[id].idx === 0 || lvl(s, BUSINESSES[BIZ[id].idx - 1].id) > 0;

export function milestoneMult(level) {
  let m = 1;
  for (const ms of MILESTONES) if (level >= ms) m *= 2;
  return m;
}
export const nextMilestone = (level) => MILESTONES.find((m) => m > level) ?? null;
export const prevMilestone = (level) => [...MILESTONES].reverse().find((m) => m <= level) ?? 0;
export const bizIncome = (b, level) => (level <= 0 ? 0 : b.baseIncome * level * milestoneMult(level));

export function costFor(b, level, count) {
  const g = b.growth;
  return (b.baseCost * Math.pow(g, level) * (Math.pow(g, count) - 1)) / (g - 1);
}
export function maxAffordable(b, level, money) {
  const g = b.growth;
  const first = b.baseCost * Math.pow(g, level);
  if (money < first) return 0;
  let k = Math.floor(Math.log((money * (g - 1)) / first + 1) / Math.log(g));
  while (k > 0 && costFor(b, level, k) > money) k--;
  return k;
}

// ---------- цена и спрос ----------
// Спрос падает, когда цена выше «честной», и растёт, когда ниже: demand = 2 − цена/честная (от 0 до 1,6).
export function priceInfo(s) {
  const st = s.setup;
  if (!st) return { fair: BASE_PRICE, unit: 0, demand: 0, profit: 0, factor: 0, traffic: 0, best: BASE_PRICE };
  const types = BUSINESSES.reduce((a, b) => a + (lvl(s, b.id) > 0 ? 1 : 0), 0);
  const fair = BASE_PRICE * LOC[st.loc].fair * MEAT[st.meat].fair * (1 + BRAND_STEP * (types - 1));
  const unit = MEAT[st.meat].unit;
  const price = s.price || BASE_PRICE;
  const demand = Math.min(1.6, Math.max(0, 2 - price / fair));
  const profit = price - unit;
  const best = Math.round((fair + unit / 2) / PRICE_STEP) * PRICE_STEP; // цена с максимальной прибылью
  return { fair, unit, demand, profit, factor: (Math.max(0, profit) * demand) / REF_PROFIT, traffic: LOC[st.loc].traffic * EQ[st.equip].speed, best };
}
export function setPrice(s, price) {
  const p = Math.round(Number(price) / PRICE_STEP) * PRICE_STEP;
  if (!Number.isFinite(p)) return false;
  s.price = Math.min(PRICE_MAX, Math.max(PRICE_MIN, p));
  return true;
}
export const setupCost = (loc, equip, meat) => (LOC[loc]?.cost ?? NaN) + (EQ[equip]?.cost ?? NaN) + (MEAT[meat]?.cost ?? NaN);
export function applySetup(s, loc, equip, meat) {
  if (s.setup) return { ok: false, reason: 'already' };
  const cost = setupCost(loc, equip, meat);
  if (!Number.isFinite(cost)) return { ok: false, reason: 'bad_setup' };
  if (cost > s.money) return { ok: false, reason: 'money' };
  s.money -= cost;
  s.setup = { loc, equip, meat };
  return { ok: true, cost };
}

const rawIncome = (s) => BUSINESSES.reduce((a, b) => a + bizIncome(b, lvl(s, b.id)), 0);
export function baseIncome(s) {
  const pi = priceInfo(s);
  return rawIncome(s) * pi.traffic * pi.factor;
}
export const isVip = (s, t) => s.vipUntil > t;
export function multAt(s, t) {
  let m = 1 + FRANCHISE_BONUS * s.franchise;
  if (isVip(s, t)) m *= VIP_MULT;
  for (const b of s.boosts) if (b.until > t) m *= b.mult;
  return m;
}
export const incomeAt = (s, t) => baseIncome(s) * multAt(s, t);
// Доход без временных бустов: в нём считаются награды «N минут дохода».
export const steadyIncome = (s, t) => baseIncome(s) * (1 + FRANCHISE_BONUS * s.franchise) * (isVip(s, t) ? VIP_MULT : 1);
export const offlineCapSec = (s, t) => (isVip(s, t) ? OFFLINE_CAP.vip : s.manager ? OFFLINE_CAP.manager : OFFLINE_CAP.base);
export const tapValue = (s, t) => (s.setup ? Math.max(TAP_MIN, TAP_SHARE * incomeAt(s, t)) : 0);

// Клиенты у ларька Маги: счётчик для сцены и сериала, на деньги не влияет.
export function customerRate(s) { // клиентов в секунду: зависит от точек, места, аппарата и цены
  const pi = priceInfo(s);
  return (rawIncome(s) / REF_PROFIT) * pi.traffic * pi.demand;
}
export function addCustomers(s, n, now) {
  const today = dayIndex(now);
  const c = s.cust || (s.cust = { day: today, n: 0, total: 0 });
  if (c.day !== today) { c.day = today; c.n = 0; }
  c.n += n; c.total += n;
}
export const bizDay = (s, now) => dayIndex(now) - dayIndex(s.createdAt) + 1; // «День N» бизнеса
export function dayPart(now) {
  const h = new Date(now + TZ_OFFSET_H * 3600e3).getUTCHours();
  return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
}

function earn(s, amount) {
  s.money += amount; s.runEarned += amount; s.totalEarned += amount;
}

// Начисляет доход с s.ts до now. Учитывает лимит кассы и то, что бусты кончаются посреди интервала.
export function accrue(s, now) {
  if (now <= s.ts) return { earned: 0, sec: 0, capped: false };
  const start = s.ts;
  const end = Math.min(now, start + offlineCapSec(s, start) * 1000);
  const points = [start, end];
  for (const b of s.boosts) if (b.until > start && b.until < end) points.push(b.until);
  if (s.vipUntil > start && s.vipUntil < end) points.push(s.vipUntil);
  points.sort((a, b) => a - b);
  const base = baseIncome(s);
  let earned = 0;
  for (let i = 0; i < points.length - 1; i++) earned += (base * multAt(s, points[i]) * (points[i + 1] - points[i])) / 1000;
  earn(s, earned);
  addCustomers(s, (customerRate(s) * (end - start)) / 1000, now);
  s.ts = now;
  s.boosts = s.boosts.filter((b) => b.until > now);
  return { earned, sec: (end - start) / 1000, capped: now > end };
}

export function applyTaps(s, taps, now) {
  if (!(taps > 0)) return 0;
  const amount = tapValue(s, now) * taps;
  earn(s, amount);
  s.taps += taps;
  addCustomers(s, taps, now);
  return amount;
}

// count: число или 'max'
export function buy(s, id, count) {
  const b = BIZ[id];
  if (!b || !isUnlocked(s, id)) return { ok: false, reason: 'locked' };
  const level = lvl(s, id);
  const n = count === 'max' ? maxAffordable(b, level, s.money) : Math.floor(Number(count));
  if (!(n >= 1) || n > 10000) return { ok: false, reason: 'count' };
  const cost = costFor(b, level, n);
  if (cost > s.money) return { ok: false, reason: 'money' };
  s.money -= cost;
  s.biz[id] = level + n;
  return { ok: true, bought: n, cost };
}

export const prestigePoints = (runEarned) => Math.floor(Math.sqrt(runEarned / PRESTIGE_K));
export const earnedForPoints = (p) => p * p * PRESTIGE_K;
export function doPrestige(s) {
  const pts = prestigePoints(s.runEarned);
  if (pts < PRESTIGE_MIN) return { ok: false, points: pts };
  s.franchise += pts; s.prestiges += 1;
  s.money = START_CAPITAL; s.runEarned = 0; s.biz = { kiosk: 1 }; s.setup = null; s.price = BASE_PRICE;
  return { ok: true, points: pts };
}

export function addBoost(s, key, mult, durMs, now, stack = false) {
  const cur = stack && s.boosts.find((b) => b.k === key && b.until > now);
  if (cur) cur.until += durMs;
  else {
    s.boosts.push({ k: key, mult, until: now + durMs });
    if (s.boosts.length > 8) s.boosts.shift();
  }
}

// Выдать (или списать) деньги размером в N минут дохода. Списание не уводит баланс в минус.
export function grantMinutes(s, minutes, now, floorPerMin = FLOOR_PER_MIN) {
  const amount = Math.max(steadyIncome(s, now) * 60, floorPerMin) * Math.abs(minutes);
  if (minutes >= 0) { earn(s, amount); return amount; }
  const loss = Math.min(s.money, amount);
  s.money -= loss;
  return -loss;
}

export const dayIndex = (now) => Math.floor((now + TZ_OFFSET_H * 3600e3) / 86400e3);
export function dailyStatus(s, now) {
  const today = dayIndex(now);
  const available = s.daily.day !== today;
  const streak = s.daily.day === today - 1 ? s.daily.streak + 1 : available ? 1 : s.daily.streak;
  return { available, streak, minutes: DAILY_MINUTES[(streak - 1) % DAILY_MINUTES.length] };
}
