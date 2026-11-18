import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { createMemoryStorage } from '../server/storage/memory.js';
import { signInitData } from '../server/auth.js';
import * as G from '../shared/game.js';

async function boot({ botToken = '', tg = null, random = () => 0.5 } = {}) {
  let now = 1_800_000_000_000;
  const storage = createMemoryStorage();
  const cfg = { dev: !botToken, botToken, webappUrl: 'https://game.test', appLink: '', adminIds: [1], supportContact: '@help', webhookSecret: botToken ? 'sekret' : '' };
  const { server, service } = await createApp({ cfg, storage, tg, clock: () => now, random });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, user, body = {}, headers = {}) => {
    const r = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-User': String(user), ...headers }, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };
  return { call, base, storage, service, advance: (ms) => { now += ms; }, now: () => now, close: () => new Promise((r) => server.close(r)) };
}

test('полный путь игрока: вход, тапы, покупки, событие, награда, покупка за Stars, рейтинг', async () => {
  const t = await boot();
  try {
    let r = await t.call('state', 100, { sp: 'ch_memkz' });
    assert.equal(r.status, 200);
    assert.equal(r.isNew, true);
    assert.equal(r.state.biz.kiosk, 1);
    assert.equal(r.state.money, 500000);
    assert.equal(r.state.setup, null);
    assert.equal((await t.storage.getUser(100)).source, 'ch_memkz');

    // стартовый опрос: слишком дорогой набор отклоняется, нормальный списывает деньги
    assert.equal((await t.call('setup', 100, { loc: 'center', equip: 'pro', meat: 'beef' })).error, 'money');
    r = await t.call('setup', 100, { loc: 'bus', equip: 'new', meat: 'chicken' });
    assert.equal(r.state.money, 220000);
    assert.equal((await t.call('setup', 100, { loc: 'uni', equip: 'used', meat: 'mix' })).error, 'already');

    // цена: сервер округляет до шага и держит в границах
    r = await t.call('price', 100, { price: 1777 });
    assert.equal(r.state.price, 1800);
    assert.equal((await t.call('price', 100, { price: 'x' })).error, 'bad_price');

    // тапы: сервер не засчитывает больше лимита
    const m0 = r.state.money;
    t.advance(1000);
    r = await t.call('sync', 100, { taps: 100000 });
    const perTap = G.tapValue(r.state, r.serverTime), inc = G.incomeAt(r.state, r.serverTime);
    assert.ok(r.state.money - m0 <= (G.MAX_TPS + G.TAP_BURST) * perTap + inc + 1, `Δ=${r.state.money - m0}`);

    // покупка без денег отклоняется
    r = await t.call('buy', 100, { biz: 'kiosk', count: 5000 });
    assert.deepEqual([r.status, r.error], [400, 'money']);

    t.advance(10 * 60e3);
    r = await t.call('buy', 100, { biz: 'kiosk', count: 'max' });
    assert.equal(r.status, 200);
    assert.ok(r.state.biz.kiosk > 1);

    // через 3 минуты после старта появилась ситуация; последствия клиенту не видны
    assert.ok(r.state.event, 'событие должно появиться');
    assert.equal(r.state.event.options.length, 3);
    assert.ok(!JSON.stringify(r.state.event).includes('"q"'));

    // подсказка тратит совет и показывает лучший вариант
    r = await t.call('event/hint', 100);
    assert.equal(r.state.hints, 0);
    const best = r.state.event.hint;
    r = await t.call('event/choose', 100, { choice: best });
    assert.equal(r.result.q, 'best');
    assert.equal(r.state.event, null);
    assert.equal(r.state.ev.streak, 1);
    r = await t.call('event/choose', 100, { choice: 0 });
    assert.equal(r.error, 'no_event');

    // ежедневная награда один раз в сутки
    r = await t.call('daily', 100);
    assert.equal(r.daily.streak, 1);
    assert.equal((await t.call('daily', 100)).error, 'claimed');

    // покупка в режиме разработки: одноразовый товар нельзя взять дважды
    r = await t.call('dev/pay', 100, { product: 'starter' });
    assert.equal(r.state.starter, true);
    assert.equal(r.state.hints, 3);
    assert.ok(r.state.boosts.some((b) => b.k === 'stars2' && b.mult === 2));
    assert.equal((await t.call('dev/pay', 100, { product: 'starter' })).error, 'owned');
    assert.equal((await t.storage.getUser(100)).stars_spent, 25);

    // город и рейтинг
    assert.equal((await t.call('leaderboard', 100, { scope: 'city' })).error, 'no_city');
    assert.equal((await t.call('city', 100, { city: 'Нарния' })).error, 'bad_city');
    await t.call('city', 100, { city: 'Алматы' });
    r = await t.call('leaderboard', 100, { scope: 'global' });
    assert.equal(r.me.rank, 1);
    assert.equal(r.rows[0].id, 100);
    r = await t.call('leaderboard', 100, { scope: 'cities' });
    assert.equal(r.rows[0].city, 'Алматы');
  } finally { await t.close(); }
});

test('рефералка: награда обоим после 10 уровней, сам себя пригласить нельзя', async () => {
  const t = await boot();
  try {
    await t.call('state', 1);
    await t.call('setup', 1, { loc: 'bus', equip: 'new', meat: 'chicken' });
    await t.call('state', 2, { sp: 'ref_1' });
    await t.call('setup', 2, { loc: 'bus', equip: 'new', meat: 'chicken' });
    await t.call('state', 3, { sp: 'ref_3' });
    assert.equal((await t.storage.getUser(2)).referrer_id, 1);
    assert.equal((await t.storage.getUser(3)).referrer_id, null);

    t.advance(2 * 3600e3);
    const r = await t.call('buy', 2, { biz: 'kiosk', count: 10 });
    assert.ok(r.refBonus.amount > 0);
    assert.equal(r.state.ref.rewarded, true);
    await new Promise((res) => setTimeout(res, 50));
    const inviter = await t.call('sync', 1);
    assert.equal(inviter.state.ref.count, 1);
    assert.ok(inviter.state.boosts.some((b) => b.k === 'ref'));
    // второй раз награда не выдаётся
    const again = await t.call('buy', 2, { biz: 'kiosk', count: 1 });
    assert.equal(again.refBonus, undefined);
  } finally { await t.close(); }
});

test('возврат после отсутствия: начислено не больше лимита кассы', async () => {
  const t = await boot();
  try {
    await t.call('state', 7);
    const st = await t.call('setup', 7, { loc: 'bus', equip: 'new', meat: 'chicken' });
    const rate = G.baseIncome(st.state);
    t.advance(10 * 3600e3);
    const r = await t.call('state', 7);
    assert.equal(r.offline.capped, true);
    assert.equal(Math.round(r.offline.sec), G.OFFLINE_CAP.base);
    assert.ok(Math.abs(r.offline.earned - rate * G.OFFLINE_CAP.base) < 1);
  } finally { await t.close(); }
});

test('боевой режим: без подписи Telegram не пускает, платёж Stars выдаёт товар один раз', async () => {
  const token = '111:AAA';
  const calls = [];
  const tg = {
    call: async (method, params) => { calls.push([method, params]); return method === 'createInvoiceLink' ? 'https://t.me/$invoice' : true; },
    sendMessage: async (chat, text) => { calls.push(['sendMessage', { chat, text }]); },
  };
  const t = await boot({ botToken: token, tg });
  try {
    assert.equal((await t.call('state', 5)).status, 401);
    const initData = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 5, first_name: 'Айдар' }) }, token);
    const h = { 'X-Init-Data': initData };
    let r = await t.call('state', 0, {}, h);
    assert.equal(r.me.name, 'Айдар');
    assert.equal((await t.call('dev/pay', 0, { product: 'vip30' }, h)).status, 404);

    r = await t.call('invoice', 0, { product: 'vip30' }, h);
    assert.equal(r.link, 'https://t.me/$invoice');
    const inv = calls.find((c) => c[0] === 'createInvoiceLink')[1];
    assert.deepEqual([inv.currency, inv.prices[0].amount, inv.provider_token], ['XTR', 199, '']);

    // проверка перед оплатой: чужой счёт и неверная сумма отклоняются
    const pcq = (over) => t.service.handleUpdate({ pre_checkout_query: { id: 'q', from: { id: 5 }, currency: 'XTR', total_amount: 199, invoice_payload: inv.payload, ...over } });
    const lastAnswer = () => calls.filter((c) => c[0] === 'answerPreCheckoutQuery').at(-1)[1].ok;
    await pcq({}); assert.equal(lastAnswer(), true);
    await pcq({ total_amount: 1 }); assert.equal(lastAnswer(), false);
    await pcq({ from: { id: 6 } }); assert.equal(lastAnswer(), false);

    // успешный платёж пришёл дважды — VIP выдан один раз
    const paid = { message: { from: { id: 5 }, chat: { id: 5, type: 'private' }, successful_payment: { currency: 'XTR', total_amount: 199, invoice_payload: inv.payload, telegram_payment_charge_id: 'ch_1' } } };
    await t.service.handleUpdate(paid);
    await t.service.handleUpdate(paid);
    r = await t.call('sync', 0, {}, h);
    const days = (r.state.vipUntil - r.serverTime) / 86400e3;
    assert.ok(days > 29.9 && days <= 30, `vip days=${days}`);
    assert.equal((await t.storage.getUser(5)).stars_spent, 199);

    // возврат доступен только админу
    const cmd = (from, text) => t.service.handleUpdate({ message: { from: { id: from }, chat: { id: from, type: 'private' }, text } });
    await cmd(5, '/refund ch_1');
    assert.equal(calls.some((c) => c[0] === 'refundStarPayment'), false);
    await cmd(1, '/refund ch_1');
    assert.equal(calls.some((c) => c[0] === 'refundStarPayment'), true);
    assert.equal((await t.storage.getPurchase('ch_1')).refunded, true);
    await cmd(1, '/stats');
    assert.match(calls.at(-1)[1].text, /Игроков: 1/);
  } finally { await t.close(); }
});

test('статика отдаётся, выход за пределы папки запрещён', async () => {
  const t = await boot();
  try {
    assert.equal((await fetch(t.base + '/')).status, 200);
    assert.equal((await fetch(t.base + '/shared/game.js')).status, 200);
    assert.notEqual((await fetch(t.base + '/shared/..%2Fserver%2Fevents-data.js')).status, 200);
    assert.notEqual((await fetch(t.base + '/..%2F.env.example')).status, 200);
  } finally { await t.close(); }
});

test('б/у аппарат ломается; покупка нового в ситуации заменяет аппарат навсегда', async () => {
  const t = await boot({ random: () => 0.1 });
  try {
    await t.call('state', 9);
    await t.call('setup', 9, { loc: 'bus', equip: 'used', meat: 'chicken' });
    t.advance(4 * 60e3);
    let r = await t.call('sync', 9);
    assert.equal(r.state.event.title, 'Аппарат сломался');
    r = await t.call('event/hint', 9);
    const before = r.state.money;
    r = await t.call('event/choose', 9, { choice: r.state.event.hint });
    assert.equal(r.result.q, 'best');
    assert.equal(r.state.setup.equip, 'new');
    assert.ok(Math.abs(before - r.state.money - 200000) < 1);
    // с новым аппаратом поломка больше не выпадает
    t.advance(3 * 3600e3);
    r = await t.call('sync', 9);
    assert.notEqual(r.state.event.title, 'Аппарат сломался');
  } finally { await t.close(); }
});

test('до стартового опроса ситуации не приходят и доход не идёт', async () => {
  const t = await boot();
  try {
    await t.call('state', 11);
    t.advance(30 * 60e3);
    const r = await t.call('sync', 11, { taps: 50 });
    assert.equal(r.state.event, null);
    assert.equal(r.state.money, 500000);
  } finally { await t.close(); }
});

test('вебхук: без секрета Telegram запрос отклоняется, с секретом обновление обрабатывается', async () => {
  const sent = [];
  const tg = { call: async () => true, sendMessage: async (chat, text) => { sent.push(text); } };
  const t = await boot({ botToken: '222:BBB', tg });
  try {
    const upd = JSON.stringify({ update_id: 1, message: { from: { id: 3 }, chat: { id: 3, type: 'private' }, text: '/start' } });
    const post = (headers) => fetch(t.base + '/tg/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: upd });
    assert.equal((await post({})).status, 403);
    assert.equal((await post({ 'X-Telegram-Bot-Api-Secret-Token': 'wrong' })).status, 403);
    assert.equal(sent.length, 0);
    assert.equal((await post({ 'X-Telegram-Bot-Api-Secret-Token': 'sekret' })).status, 200);
    assert.match(sent[0], /Мага/);
  } finally { await t.close(); }
});

test('скорость: 2x бесплатно, 5x только с турбо; ускорение только пока игрок в игре', async () => {
  const t = await boot();
  try {
    await t.call('state', 21);
    let r = await t.call('setup', 21, { loc: 'bus', equip: 'new', meat: 'chicken' });
    const base = G.baseIncome(r.state);
    assert.equal((await t.call('speed', 21, { speed: 5 })).error, 'need_turbo');
    assert.equal((await t.call('speed', 21, { speed: 3 })).error, 'bad_speed');
    r = await t.call('speed', 21, { speed: 2 });
    let m0 = r.state.money;
    t.advance(10_000);
    r = await t.call('sync', 21);
    assert.ok(Math.abs(r.state.money - m0 - base * 2 * 10) < 1, 'в игре 2x');
    // ушёл из игры на час: ускорение действует только 25 секунд после последнего запроса
    m0 = r.state.money;
    t.advance(3600e3);
    r = await t.call('state', 21);
    const expect = base * (2 * 25 + (3600 - 25));
    assert.ok(Math.abs(r.state.money - m0 - expect) < 1, `офлайн 1x: ${r.state.money - m0} vs ${expect}`);
    assert.ok(r.offline.days >= 6);
    r = await t.call('dev/pay', 21, { product: 'turbo' });
    assert.equal(r.state.g.turbo, true);
    assert.equal(r.state.g.speed, 5);
    assert.equal((await t.call('speed', 21, { speed: 1 })).state.g.speed, 1);
  } finally { await t.close(); }
});

test('имя игрока: проверка и показ в рейтинге; Telegram-имя его не перезаписывает', async () => {
  const t = await boot();
  try {
    await t.call('state', 31);
    assert.equal((await t.call('name', 31, { name: 'a' })).error, 'bad_name');
    assert.equal((await t.call('name', 31, { name: '<script>' })).error, 'bad_name');
    let r = await t.call('name', 31, { name: '  Маға  Бизнесмен ' });
    assert.equal(r.state.nick, 'Маға Бизнесмен');
    r = await t.call('state', 31);
    assert.equal(r.me.name, 'Маға Бизнесмен');
    r = await t.call('leaderboard', 31, { scope: 'global' });
    assert.equal(r.rows[0].name, 'Маға Бизнесмен');
  } finally { await t.close(); }
});

test('старое сохранение (до версии 3) переводится на новую экономику, покупки остаются', async () => {
  const t = await boot();
  try {
    await t.call('state', 41);
    const row = await t.storage.getUser(41);
    row.state.v = 2; row.state.biz = { kiosk: 300, mall: 200 }; row.state.money = 1e15; row.state.manager = true; delete row.state.g;
    await t.storage.updateUser(41, { state: row.state });
    t.service.flushAll();
    const t2 = await boot(); // новый процесс сервера читает старую запись
    await t2.storage.insertUser(row);
    const r = await t2.call('state', 41);
    assert.equal(r.state.v, G.STATE_VERSION);
    assert.equal(r.state.money, G.START_CAPITAL);
    assert.equal(r.state.biz.kiosk, 1);
    assert.equal(r.state.manager, true);
    assert.equal(r.migrated, true);
    await t2.close();
  } finally { await t.close(); }
});

test('админ-меню: только для админа; рассылка уходит всем игрокам', async () => {
  const sent = [], calls = [];
  const tg = {
    call: async (method, params) => { calls.push([method, params]); return true; },
    sendMessage: async (chat, text, extra) => { sent.push({ chat, text, extra }); },
  };
  const t = await boot({ botToken: '333:CCC', tg });
  try {
    for (const id of [501, 502, 503]) {
      const init = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'P' + id }) }, '333:CCC');
      await t.call('state', 0, {}, { 'X-Init-Data': init });
    }
    const cmd = (from, text) => t.service.handleUpdate({ message: { from: { id: from }, chat: { id: from, type: 'private' }, text } });
    const cb = (from, data) => t.service.handleUpdate({ callback_query: { id: 'c', from: { id: from }, data, message: { chat: { id: from }, message_id: 9 } } });
    await cmd(501, '/admin');
    assert.equal(sent.length, 0, 'не админ ничего не получает');
    await cmd(1, '/admin');
    assert.ok(sent.at(-1).extra.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === 'adm:stats'));
    await cb(1, 'adm:stats');
    assert.match(calls.filter((c) => c[0] === 'editMessageText').at(-1)[1].text, /Игроков: 3/);
    await cb(1, 'adm:top');
    assert.match(calls.filter((c) => c[0] === 'editMessageText').at(-1)[1].text, /Топ-10/);
    await cmd(1, '/player 502');
    assert.match(sent.at(-1).text, /P502/);
    await cmd(1, '/broadcast Мага открыл новую точку!');
    assert.match(sent.at(-1).text, /получат 3 игроков/);
    const before = sent.length;
    await cb(1, 'adm:bc_go');
    await new Promise((r) => setTimeout(r, 400));
    const got = sent.slice(before).filter((m) => m.text === 'Мага открыл новую точку!').map((m) => m.chat).sort();
    assert.deepEqual(got, [501, 502, 503]);
    assert.match(sent.at(-1).text, /доставлено 3/);
    const edits = calls.filter((c) => c[0] === 'editMessageText').length;
    await cb(501, 'adm:stats'); // не админ: только ответ на нажатие
    assert.equal(calls.filter((c) => c[0] === 'editMessageText').length, edits);
  } finally { await t.close(); }
});
