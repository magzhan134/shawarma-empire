import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../shared/game.js';
import { EVENTS } from '../server/events-data.js';
import { verifyInitData, signInitData } from '../server/auth.js';

const mk = (t = 0) => { const s = G.newState(t); G.applySetup(s, 'bus', 'new', 'chicken'); return s; };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('цена пачки уровней равна сумме цен по одному', () => {
  const b = G.BIZ.mall;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += G.costFor(b, 7 + i, 1);
  near(G.costFor(b, 7, 10), sum);
});

test('max покупает ровно столько, на сколько хватает денег', () => {
  const b = G.BIZ.kiosk;
  for (const money of [0, 5, 11, 100, 12345, 9e9]) {
    const k = G.maxAffordable(b, 1, money);
    if (k > 0) assert.ok(G.costFor(b, 1, k) <= money);
    assert.ok(G.costFor(b, 1, k + 1) > money);
  }
});

test('доход начисляется по времени и упирается в лимит кассы', () => {
  const s = mk(0);
  const R = G.baseIncome(s);
  assert.ok(R > 0);
  const r1 = G.accrue(s, 10_000);
  near(r1.earned, R * 10);
  const r2 = G.accrue(s, 10_000 + 5 * 3600e3); // 5 часов без управляющего → засчитается 2 часа
  near(r2.earned, R * 7200);
  assert.equal(r2.capped, true);
  s.manager = true;
  const r3 = G.accrue(s, s.ts + 5 * 3600e3);
  near(r3.earned, R * 5 * 3600);
  assert.equal(r3.capped, false);
});

test('буст, который кончается посреди интервала, считается только до своего конца', () => {
  const s = mk(0);
  const R = G.baseIncome(s);
  G.addBoost(s, 'x', 2, 30_000, 0);
  const r = G.accrue(s, 60_000);
  near(r.earned, R * 2 * 30 + R * 30);
  assert.equal(s.boosts.length, 0);
});

test('одинаковые бусты складываются по времени, а не по множителю', () => {
  const s = mk(0);
  G.addBoost(s, 'stars2', 2, 1000, 0, true);
  G.addBoost(s, 'stars2', 2, 1000, 0, true);
  assert.equal(s.boosts.length, 1);
  assert.equal(s.boosts[0].until, 2000);
  near(G.multAt(s, 500), 2);
});

test('покупка: нельзя без денег и нельзя закрытую точку', () => {
  const s = mk(0);
  s.money = 0;
  assert.equal(G.buy(s, 'kiosk', 1).reason, 'money');
  s.money = 1e12;
  assert.equal(G.buy(s, 'cafe', 1).reason, 'locked');
  assert.equal(G.buy(s, 'mall', 1).ok, true);
  assert.equal(G.buy(s, 'cafe', 1).ok, true);
  assert.equal(G.buy(s, 'nope', 1).ok, false);
  assert.equal(G.buy(s, 'kiosk', -5).ok, false);
});

test('рубежи удваивают доход точки', () => {
  const b = G.BIZ.kiosk;
  near(G.bizIncome(b, 24), b.baseIncome * 24);
  near(G.bizIncome(b, 25), b.baseIncome * 25 * 2);
  near(G.bizIncome(b, 50), b.baseIncome * 50 * 4);
});

test('престиж сбрасывает забег и даёт постоянный множитель', () => {
  const s = mk(0);
  s.runEarned = G.earnedForPoints(G.PRESTIGE_MIN) - 1;
  assert.equal(G.doPrestige(s).ok, false);
  s.runEarned = G.earnedForPoints(12); s.money = 555; s.biz.mall = 9;
  const r = G.doPrestige(s);
  assert.deepEqual([r.ok, r.points, s.franchise, s.money, s.biz.mall, s.setup], [true, 12, 12, G.START_CAPITAL, undefined, null]);
  near(G.multAt(s, 0), 1 + 12 * G.FRANCHISE_BONUS);
});

test('штраф в минутах дохода не уводит баланс в минус', () => {
  const s = mk(0);
  s.money = 10;
  G.grantMinutes(s, -30, 0);
  assert.equal(s.money, 0);
});

test('ежедневная награда: серия растёт подряд и сбрасывается после пропуска', () => {
  const s = mk(0);
  const day = 86400e3;
  let st = G.dailyStatus(s, 10 * day);
  assert.deepEqual([st.available, st.streak], [true, 1]);
  s.daily = { day: G.dayIndex(10 * day), streak: 1 };
  assert.equal(G.dailyStatus(s, 10 * day + 1000).available, false);
  assert.equal(G.dailyStatus(s, 11 * day).streak, 2);
  assert.equal(G.dailyStatus(s, 13 * day).streak, 1);
});

test('у каждой ситуации ровно один лучший, один нейтральный и один плохой вариант', () => {
  assert.ok(EVENTS.length >= 25);
  assert.ok(EVENTS.every((e) => !e.special));
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  for (const e of EVENTS) {
    assert.deepEqual(e.options.map((o) => o.q).sort(), ['bad', 'best', 'ok'], e.id);
    // итог в «минутах дохода»: лучший вариант должен быть выгоднее остальных
    const value = (o) => o.money + (o.mult ? (o.mult - 1) * o.dur : 0);
    const [best, ok, bad] = ['best', 'ok', 'bad'].map((q) => value(e.options.find((o) => o.q === q)));
    assert.ok(best > ok && ok > bad, `${e.id}: ${best} / ${ok} / ${bad}`);
  }
});

test('формат чисел', () => {
  assert.equal(G.fmt(999), '999');
  assert.equal(G.fmt(1234), '1,23 тыс');
  assert.equal(G.fmt(12_345_678), '12,3 млн');
  assert.equal(G.fmt(3.4e9), '3,40 млрд');
  assert.equal(G.fmt(999_999), '999 тыс');
});

test('подпись initData: верная проходит, подделка и старая — нет', () => {
  const token = '123456:TEST';
  const now = 1_800_000_000;
  const data = signInitData({ auth_date: String(now), user: JSON.stringify({ id: 42, first_name: 'Маға' }), start_param: 'ch_test' }, token);
  const ok = verifyInitData(data, token, 86400, now + 10);
  assert.equal(ok.user.id, 42);
  assert.equal(ok.startParam, 'ch_test');
  assert.equal(verifyInitData(data.replace('42', '43'), token, 86400, now + 10), null);
  assert.equal(verifyInitData(data, 'other:TOKEN', 86400, now + 10), null);
  assert.equal(verifyInitData(data, token, 86400, now + 90000), null);
});

test('игровые сутки: клиенты и выручка считаются по дням, итог закрытого дня сохраняется', () => {
  const s = mk(0);
  assert.equal(G.gameDay(s), 1);
  assert.deepEqual(G.gameClock(s), { h: 6, m: 0 });
  assert.equal(G.dayPart(s), 'dawn');
  const half = G.GAME_DAY_MS / 2;
  G.accrue(s, half);
  assert.deepEqual(G.gameClock(s), { h: 18, m: 0 });
  assert.equal(G.dayPart(s), 'dusk');
  const rate = G.customerRate(s), inc = G.baseIncome(s);
  near(s.cust.n, (rate * half) / 1000);
  G.accrue(s, half * 3); // прошли конец первых суток и половину вторых... и ещё сутки
  assert.equal(G.gameDay(s), 2);
  assert.equal(s.g.last.day, 1);
  near(s.g.last.rev, (inc * G.GAME_DAY_MS) / 1000);
  near(s.cust.n, (rate * half) / 1000);
  // скорость 2x пока игрок в игре: сутки проходят вдвое быстрее
  s.g.speed = 2; s.g.activeUntil = s.ts + G.GAME_DAY_MS;
  G.accrue(s, s.ts + half);
  assert.equal(G.gameDay(s), 3);
  // старое сохранение мигрирует
  const old = mk(0); old.v = 2; delete old.g; old.manager = true; old.biz.kiosk = 500;
  assert.equal(G.migrate(old, 5), true);
  assert.deepEqual([old.v, old.biz.kiosk, old.manager, old.g.speed], [G.STATE_VERSION, 1, true, 1]);
  assert.equal(G.migrate(old, 6), false);
});

test('работники появляются с ростом уровня точки', () => {
  assert.deepEqual(G.staffFor('kiosk', 1).map((w) => w.name), ['Мага']);
  assert.deepEqual(G.staffFor('kiosk', 25).map((w) => w.name), ['Мага', 'Рустам']);
  assert.equal(G.staffFor('cafe', 0).length, 0);
  for (const b of G.BUSINESSES) assert.ok(G.STAFF[b.id]?.length >= 2, b.id);
});

test('старт: капитал 500 тыс, без выбора точки и аппарата дохода нет', () => {
  const s = G.newState(0);
  assert.equal(s.money, 500000);
  assert.equal(G.baseIncome(s), 0);
  assert.equal(G.applySetup(s, 'center', 'pro', 'beef').reason, 'money'); // 640 тыс не по карману
  assert.equal(G.applySetup(s, 'moon', 'new', 'beef').reason, 'bad_setup');
  assert.deepEqual(G.applySetup(s, 'uni', 'used', 'mix'), { ok: true, cost: 220000 });
  assert.equal(s.money, 280000);
  assert.equal(G.applySetup(s, 'bus', 'new', 'chicken').reason, 'already');
  assert.ok(G.baseIncome(s) > 0);
});

test('цена донера: дороже — меньше клиентов, есть цена с максимальной прибылью', () => {
  const s = mk(0);
  assert.equal(s.price, 1500);
  const at = (p) => { G.setPrice(s, p); return { c: G.customerRate(s), inc: G.baseIncome(s) }; };
  const a = at(1500), b = at(2000), c = at(1000);
  assert.ok(b.c < a.c && a.c < c.c, 'клиентов меньше при высокой цене');
  const best = G.priceInfo(s).best;
  const top = at(best).inc;
  for (const p of [best - 300, best - 100, best + 100, best + 300, 500, 8000]) assert.ok(at(p).inc <= top + 1e-9, `цена ${p}`);
  assert.equal(at(5000).c, 0); // слишком дорого: никто не покупает
  assert.equal(at(400).inc, 0); // ниже себестоимости прибыли нет (цена прижата к 500 = себестоимость курицы)
  G.setPrice(s, 1234); assert.equal(s.price, 1250);
  G.setPrice(s, 99999); assert.equal(s.price, G.PRICE_MAX);
  assert.equal(G.setPrice(s, 'abc'), false);
});

test('место и мясо меняют честную цену, новые точки поднимают бренд', () => {
  const a = G.newState(0), b = G.newState(0);
  G.applySetup(a, 'uni', 'new', 'chicken'); G.applySetup(b, 'center', 'new', 'beef');
  assert.ok(G.priceInfo(b).fair > G.priceInfo(a).fair);
  const before = G.priceInfo(a).fair;
  a.biz.mall = 1;
  near(G.priceInfo(a).fair, before * (1 + G.BRAND_STEP));
});
