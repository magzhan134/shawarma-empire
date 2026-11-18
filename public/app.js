import * as G from '/shared/game.js';

const tg = window.Telegram?.WebApp;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = G.CURRENCY;

let S = null, CFG = {}, ME = {};
let offset = 0, pendingTaps = 0, buyMode = 1, tab = 'biz', topScope = 'global', lastSync = 0, hiddenAt = 0;
const now = () => Date.now() + offset;

let devId = '1';
try { devId = localStorage.getItem('devId') || String(Math.floor(Math.random() * 9e8) + 1e8); localStorage.setItem('devId', devId); } catch {}

const ERR = {
  money: 'Не хватает денег', locked: 'Сначала открой предыдущую точку', slow_down: 'Слишком быстро, подожди пару секунд',
  owned: 'Это у тебя уже есть', already: 'Точка уже выбрана', bad_setup: 'Выбери вариант из списка', bad_price: 'Неверная цена', no_hints: 'Советы закончились', claimed: 'Награда уже получена', not_enough: 'Пока рано продавать сеть',
  network: 'Нет связи с сервером', no_city: 'Сначала выбери город',
};

// ---------- сеть: запросы идут строго по очереди ----------
let chain = Promise.resolve();
function api(path, body = {}) {
  const run = async () => {
    const carries = !['track', 'leaderboard', 'state'].includes(path);
    const taps = carries ? pendingTaps : 0; if (carries) pendingTaps = 0;
    let res;
    try {
      res = await fetch('/api/' + path, { method: 'POST', body: JSON.stringify({ ...body, taps }),
        headers: { 'Content-Type': 'application/json', 'X-Init-Data': tg?.initData || '', 'X-Dev-User': devId } });
    } catch { pendingTaps += taps; const e = new Error('network'); e.code = 'network'; throw e; }
    const j = await res.json().catch(() => ({}));
    if (j.state) {
      S = j.state; ME = j.me; offset = j.serverTime - Date.now(); lastSync = Date.now();
      if (pendingTaps) G.applyTaps(S, pendingTaps, now());
    }
    if (!res.ok) { const e = new Error(j.error || 'server'); e.code = j.error || 'server'; throw e; }
    return j;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}
const fail = (e) => { toast(ERR[e.code] || 'Что-то пошло не так'); };
const resync = () => api('sync').then(refresh).catch(() => {});

// ---------- мелочи ----------
const haptic = (kind = 'light') => { try { kind === 'ok' ? tg?.HapticFeedback?.notificationOccurred('success') : tg?.HapticFeedback?.impactOccurred(kind); } catch {} };
let toastTimer;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}
function openLink(url) { try { if (tg?.openTelegramLink && url.startsWith('https://t.me/')) return tg.openTelegramLink(url); } catch {} window.open(url, '_blank'); }
function share(text) {
  api('track', { type: 'share' }).catch(() => {});
  openLink(`https://t.me/share/url?url=${encodeURIComponent(CFG.refLink)}&text=${encodeURIComponent(text)}`);
}

// ---------- модальное окно ----------
let modalActs = {}, modalSticky = false;
function modal(html, acts = {}, sticky = false) {
  $('sheet').innerHTML = html; modalActs = acts; modalSticky = sticky; $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; modalActs = {}; }
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) { if (!modalSticky) closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = modalActs[el.dataset.act];
  if (fn) fn(el.dataset.arg, el); else if (el.dataset.act === 'close') closeModal();
});

// ---------- шапка ----------
function renderHud() {
  const t = now();
  $('money').textContent = G.fmt(S.money);
  $('rate').textContent = G.fmtRate(G.incomeAt(S, t));
  $('tapVal').textContent = '+' + G.fmtRate(G.tapValue(S, t));
  const PART = { dawn: 'утро', day: 'день', dusk: 'вечер', night: 'ночь' };
  $('dayLabel').textContent = `День ${G.bizDay(S, t)} · ${PART[G.dayPart(t)]}`;
  $('custToday').textContent = G.fmt(S.cust?.n || 0);
  const pi = G.priceInfo(S);
  $('priceVal').textContent = S.price;
  $('pDemand').textContent = Math.round(pi.demand * 100) + '%';
  $('pProfit').textContent = pi.profit;
  const ph = $('pHint');
  const [cls, txt] = pi.profit <= 0 ? ['high', 'Мага: «Брат, мы так в минус работаем»'] : pi.demand <= 0 ? ['high', 'Мага: «За такие деньги никто не берёт»']
    : S.price < pi.best * 0.93 ? ['low', 'Мага: «Очередь до угла. Можно дороже»'] : S.price > pi.best * 1.07 ? ['high', 'Мага: «Дорого, брат. Люди уходят»'] : ['fit', 'Мага: «Цена в самый раз»'];
  if (ph.textContent !== txt) { ph.textContent = txt; ph.className = 'phint ' + cls; }
  const tags = [];
  if (G.isVip(S, t)) tags.push(`<span class="tag vip">VIP · ${G.fmtDur((S.vipUntil - t) / 1000)}</span>`);
  if (S.franchise > 0) tags.push(`<span class="tag">👑 +${Math.round(S.franchise * G.FRANCHISE_BONUS * 100)}%</span>`);
  for (const b of S.boosts) if (b.until > t) tags.push(`<span class="tag ${b.mult >= 1 ? 'up' : 'down'}">×${String(b.mult).replace('.', ',')} · ${G.fmtDur((b.until - t) / 1000)}</span>`);
  const html = tags.join('');
  if ($('tags').dataset.h !== html) { $('tags').innerHTML = html; $('tags').dataset.h = html; }
  $('dailyBtn').querySelector('.dot').hidden = !G.dailyStatus(S, t).available;
  $('eventBanner').hidden = !S.event;
}

// ---------- экран «Бизнес» ----------
const bizEls = {};
function buildBiz() {
  $('bizList').innerHTML = G.BUSINESSES.map((b) => `
    <div class="biz" id="b_${b.id}">
      <div class="ico">${b.emoji}<span class="lv"></span></div>
      <div><h3>${esc(b.name)}</h3><div class="inc"></div><div class="bar"><i></i></div><div class="ms"></div></div>
      <button class="buy" data-biz="${b.id}"></button>
    </div>`).join('');
  for (const b of G.BUSINESSES) {
    const root = $('b_' + b.id);
    bizEls[b.id] = { root, lv: root.querySelector('.lv'), inc: root.querySelector('.inc'), bar: root.querySelector('.bar i'), ms: root.querySelector('.ms'), buy: root.querySelector('.buy') };
  }
  $('bizList').addEventListener('click', (e) => {
    const btn = e.target.closest('.buy');
    if (!btn || btn.disabled) return;
    const b = G.BIZ[btn.dataset.biz];
    const n = buyMode === 'max' ? G.maxAffordable(b, G.lvl(S, b.id), S.money) : buyMode;
    if (n < 1 || !G.buy(S, b.id, n).ok) return;
    haptic('medium');
    say('buy', false);
    updateBiz();
    api('buy', { biz: b.id, count: n }).catch((err) => { fail(err); resync(); });
  });
}
function updateBiz() {
  const pi = G.priceInfo(S);
  const mult = G.multAt(S, now()) * pi.traffic * pi.factor;
  for (const b of G.BUSINESSES) {
    const el = bizEls[b.id], level = G.lvl(S, b.id), open = G.isUnlocked(S, b.id);
    el.root.classList.toggle('locked', !open);
    el.lv.textContent = level || '';
    el.lv.hidden = !level;
    if (!open) {
      el.inc.textContent = `🔒 Сначала открой: ${G.BUSINESSES[G.BIZ[b.id].idx - 1].name}`;
      el.ms.textContent = ''; el.bar.style.width = '0';
      el.buy.disabled = true; el.buy.innerHTML = `${G.fmt(b.baseCost)} ${C}`;
      el.root.classList.remove('can');
      continue;
    }
    el.inc.textContent = level ? `+${G.fmtRate(G.bizIncome(b, level) * mult)} ${C}/сек` : `Даст +${G.fmtRate(G.bizIncome(b, 1) * mult)} ${C}/сек`;
    const next = G.nextMilestone(level), prev = G.prevMilestone(level);
    el.bar.style.width = next ? `${((level - prev) / (next - prev)) * 100}%` : '100%';
    el.ms.textContent = next ? `До уровня ${next}: доход точки ×2` : 'Все рубежи пройдены';
    const afford = G.maxAffordable(b, level, S.money);
    const n = buyMode === 'max' ? Math.max(1, afford) : buyMode;
    const can = afford >= n;
    el.buy.disabled = !can;
    el.buy.innerHTML = `${level ? '+' + n : 'Открыть'}<small>${G.fmt(G.costFor(b, level, n))} ${C}</small>`;
    el.root.classList.toggle('can', can);
  }
}

$('buyMode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  buyMode = b.dataset.m === 'max' ? 'max' : Number(b.dataset.m);
  for (const x of $('buyMode').children) x.classList.toggle('on', x === b);
  updateBiz();
});

// ---------- сцена: Мага, клиенты, реплики ----------
const SAY = {
  idle: ['Заходи, брат, донер свежий!', 'Мясо свежее, как утро в горах.', 'Соус мой, рецепт секретный.', 'Клиент сытый — Мага довольный.', 'Очередь идёт — душа поёт.', 'Режем тонко, зарабатываем толсто.', 'Пятнадцать лет у гриля, брат.'],
  night: ['Ночная смена — самая вкусная.', 'Город спит, гриль работает.'],
  buy: ['Вот это по-хозяйски!', 'Расширяемся, брат!', 'Новый уровень — новый вкус.'],
  event: ['Брат, тут ситуация. Нужна твоя голова.'],
  best: ['Красиво решил, уважаю!', 'Вот так дела и делаются.'],
  ok: ['Ладно, жить можно.'],
  bad: ['Эх… В следующий раз спроси Магу.'],
  prestige: ['Продали сеть! Начинаем заново, но уже умнее.'],
  back: ['О, хозяин вернулся! Касса ждёт.'],
};
let bubbleTimer, lastSay = 0;
function say(kind, force = true) {
  if (!force && Date.now() - lastSay < 12000) return;
  const list = SAY[kind]; if (!list) return;
  const b = $('bubble');
  b.textContent = list[Math.floor(Math.random() * list.length)];
  b.classList.add('on'); lastSay = Date.now();
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.remove('on'), 2800);
}

const SKIN = ['#f1c9a5', '#e0ac7e', '#c98f62', '#a9744f', '#8a5a3c'], SHIRT = ['#6fb6ff', '#5fd88f', '#ff8a4a', '#d9a4ff', '#ffd27a', '#ff6f91', '#9aa7b8', '#f7efe4'], HAIR = ['#1d1410', '#3a2a1c', '#6b4a2a', '#c9a45a', '#555'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const queue = []; // клиенты, которые идут к прилавку или ждут
const slotX = (i) => 52 + i * 10.5;
function spawnCustomer() {
  if (queue.length >= 4) return;
  const el = document.createElement('div');
  el.className = 'cust'; el.style.left = '104%';
  el.innerHTML = `<svg viewBox="0 0 28 54"><rect x="8" y="38" width="5" height="15" rx="2.5" fill="#2b2b3a"/><rect x="15" y="38" width="5" height="15" rx="2.5" fill="#2b2b3a"/><rect x="5" y="18" width="18" height="23" rx="7" fill="${pick(SHIRT)}"/><circle cx="14" cy="9.5" r="8" fill="${pick(SKIN)}"/><path d="M6 9.5a8 8 0 0116 0z" fill="${pick(HAIR)}"/></svg>`;
  $('custLayer').appendChild(el);
  const c = { el };
  queue.push(c);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = slotX(queue.indexOf(c)) + '%'; }));
  c.t = setTimeout(() => el.classList.add('wait'), 1150);
}
function serveCustomer() {
  const c = queue.shift();
  if (!c) return false;
  clearTimeout(c.t);
  c.el.classList.remove('wait'); c.el.classList.add('leave');
  c.el.insertAdjacentHTML('beforeend', '<span class="got">🌯</span>');
  c.el.style.left = '108%';
  setTimeout(() => c.el.remove(), 1600);
  queue.forEach((q, i) => { q.el.classList.remove('wait'); q.el.style.left = slotX(i) + '%'; clearTimeout(q.t); q.t = setTimeout(() => q.el.classList.add('wait'), 600); });
  const arm = $('magaArm'); arm.classList.remove('slice'); void arm.getBoundingClientRect(); arm.classList.add('slice');
  return true;
}
let sceneAcc = 0, serveAcc = 0;
function sceneTick(dtMs) {
  if (!S || tab !== 'biz' || document.hidden) return;
  const gap = Math.min(3500, Math.max(520, 1000 / G.customerRate(S))); // на экране не чаще ~2 клиентов в секунду
  sceneAcc += dtMs; serveAcc += dtMs;
  if (sceneAcc >= gap) { sceneAcc = 0; spawnCustomer(); }
  if (serveAcc >= gap * 1.05 && queue.length && queue[0].el.classList.contains('wait')) { serveAcc = 0; serveCustomer(); }
  const part = G.dayPart(now());
  const sc = $('tapBtn');
  if (!sc.classList.contains(part)) { sc.classList.remove('dawn', 'day', 'dusk', 'night'); sc.classList.add(part); }
  if (Date.now() - lastSay > 22000) say(part === 'night' ? 'night' : 'idle');
}

$('tapBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!S) return;
  const v = G.applyTaps(S, 1, now());
  pendingTaps++;
  haptic('light');
  const sc = $('tapBtn');
  sc.classList.add('down'); setTimeout(() => sc.classList.remove('down'), 70);
  serveCustomer(); serveAcc = 0;
  const r = sc.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = 'fly'; f.textContent = '+' + G.fmtRate(v);
  f.style.left = `${e.clientX - r.left - 12 + (Math.random() * 30 - 15)}px`; f.style.top = `${Math.max(34, e.clientY - r.top - 30)}px`;
  sc.appendChild(f); setTimeout(() => f.remove(), 800);
});

// ---------- цена донера ----------
let priceTimer;
function changePrice(dir) {
  if (!S?.setup) return;
  G.setPrice(S, S.price + dir * G.PRICE_STEP);
  haptic('light'); renderHud(); updateBiz();
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => api('price', { price: S.price }).catch((e) => { fail(e); resync(); }), 500);
}
for (const [id, dir] of [['priceDown', -1], ['priceUp', 1]]) {
  let hold;
  const stop = () => clearInterval(hold);
  $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); changePrice(dir); stop(); let n = 0; hold = setInterval(() => { if (++n > 3) changePrice(dir); }, 90); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $(id).addEventListener(ev, stop);
}

// ---------- стартовый опрос: место, аппарат, мясо ----------
function setupWizard(step = 0, sel = {}) {
  const STEPS = [
    { key: 'loc', title: 'Где ставим ларёк?', text: 'От места зависит, сколько людей пройдёт мимо и сколько они готовы платить.', list: G.LOCATIONS },
    { key: 'equip', title: 'Какой аппарат берём?', text: 'Аппарат решает, как быстро идёт очередь. Б/у дешёвый, но может встать посреди смены.', list: G.EQUIPMENT },
    { key: 'meat', title: 'Из чего донер?', text: 'Мясо покупается с каждой продажи: это себестоимость. Дороже мясо — выше цена, которую примут клиенты.', list: G.MEATS },
  ];
  const st = STEPS[step];
  const spent = (sel.loc ? G.LOC[sel.loc].cost : 0) + (sel.equip ? G.EQ[sel.equip].cost : 0);
  const left = S.money - spent;
  modal(`<div class="steps">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="says">🧔🏽 Мага: «Хозяин, решай ты, я у гриля»</div><h2>${st.title}</h2><p>${st.text}</p>
    <div class="budget"><span>Капитал</span><span>${G.fmt(left)} ${C}</span></div>
    ${st.list.map((o) => `<button class="choice" data-act="pick" data-arg="${o.id}" ${o.cost > left ? 'disabled' : ''}><span class="e">${o.emoji}</span><span><b>${esc(o.name)}</b><small>${esc(o.desc)}</small></span><span class="c">${o.cost ? (o.cost > left ? 'не хватает' : G.fmt(o.cost) + ' ' + C) : ''}</span></button>`).join('')}
    ${step > 0 ? '<button class="btn ghost" data-act="back">Назад</button>' : ''}`, {
    pick(id) {
      const next = { ...sel, [st.key]: id };
      if (step < STEPS.length - 1) return setupWizard(step + 1, next);
      api('setup', next).then(() => { closeModal(); haptic('ok'); refresh(); say('idle'); toast(`Ларёк открыт. Осталось ${G.fmt(S.money)} ${C}`); }).catch(fail);
    },
    back() { const prev = { ...sel }; delete prev[STEPS[step - 1].key]; setupWizard(step - 1, prev); },
  }, true);
}

// ---------- остальные экраны ----------
function renderFranchise() {
  const pts = G.prestigePoints(S.runEarned);
  const a = G.earnedForPoints(pts), b = G.earnedForPoints(pts + 1);
  const can = pts >= G.PRESTIGE_MIN;
  const cur = 1 + S.franchise * G.FRANCHISE_BONUS, nxt = 1 + (S.franchise + pts) * G.FRANCHISE_BONUS;
  return `<h2>Франшиза</h2><p class="sub">Продай сеть инвесторам и начни заново. Очки франшизы остаются навсегда и ускоряют каждый новый забег.</p>
    <div class="card"><div class="row"><div><div class="muted">Очки франшизы</div><div class="big">${S.franchise}</div></div>
      <div style="text-align:right"><div class="muted">Бонус к доходу</div><div class="big amber">+${Math.round(S.franchise * G.FRANCHISE_BONUS * 100)}%</div></div></div></div>
    <div class="card"><div class="muted">Если продать сеть сейчас</div>
      <div class="big good">+${pts} <span style="font-size:16px">очков</span></div>
      <div class="muted">${pts > 0 ? `Доход вырастет в ${(nxt / cur).toFixed(2).replace('.', ',')} раза` : 'Заработай больше, чтобы получить первое очко'}</div>
      <div class="bar" style="margin-top:12px"><i style="width:${Math.min(100, ((S.runEarned - a) / (b - a)) * 100)}%"></i></div>
      <div class="muted" style="margin-top:6px">До следующего очка: ${G.fmt(Math.max(0, b - S.runEarned))} ${C}</div></div>
    <button class="btn" data-act="prestige" ${can ? '' : 'disabled'}>${can ? `Продать сеть за ${pts} очков` : `Нужно минимум ${G.PRESTIGE_MIN} очков`}</button>
    <p class="muted" style="margin:12px 4px">Сбрасываются деньги и точки: ты снова получаешь 500 тыс ${C} и заново выбираешь место, аппарат и мясо. Остаются очки франшизы, покупки, активные бусты и советы.</p>
    <div class="card"><div class="row"><span class="muted">Сеть продана</span><b>${S.prestiges} раз</b></div>
      <div class="row"><span class="muted">Заработано за всё время</span><b>${G.fmt(S.totalEarned)} ${C}</b></div>
      <div class="row"><span class="muted">Лучших решений в ситуациях</span><b>${S.ev.best} из ${S.ev.total}</b></div>
      <div class="row"><span class="muted">Рекорд серии лучших решений</span><b>${S.ev.maxStreak}</b></div></div>`;
}

function productStatus(p, t) {
  if (p.id === 'starter' && S.starter) return 'Куплено';
  if (p.id === 'manager' && S.manager) return 'Нанят';
  if (p.id === 'crown' && S.crown) return 'Твоя';
  return null;
}
function renderShop() {
  const t = now();
  const note = (p) => {
    if (p.id === 'boost2') { const b = S.boosts.find((x) => x.k === 'stars2' && x.until > t); return b ? `<p class="good">Активно ещё ${G.fmtDur((b.until - t) / 1000)}</p>` : ''; }
    if (p.id === 'vip30' && G.isVip(S, t)) return `<p class="good">Активен ещё ${G.fmtDur((S.vipUntil - t) / 1000)}</p>`;
    if (p.id === 'hints5') return `<p class="good">У тебя советов: ${S.hints}</p>`;
    return '';
  };
  return `<h2>Магазин</h2><p class="sub">Покупки за Telegram Stars. Ты всегда видишь, что именно получаешь.</p>
    ${G.PRODUCTS.map((p) => { const st = productStatus(p, t); return `<div class="card product"><div class="ico">${p.emoji}</div>
      <div><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p>${note(p)}</div>
      <button class="price" data-act="buyProduct" data-arg="${p.id}" ${st ? 'disabled' : ''}>${st || '⭐ ' + p.stars}</button></div>`; }).join('')}
    <p class="muted" style="margin:12px 4px">Игровые тенге (${C}) — виртуальная валюта. Она не выводится и не обменивается на деньги или Stars. Вопросы по оплате: команда /paysupport в боте.</p>`;
}

let topData = null, topLoading = false;
function renderTop() {
  const seg = [['global', 'Игроки'], ['city', 'Мой город'], ['cities', 'Города']].map(([k, n]) => `<button data-act="scope" data-arg="${k}" class="${topScope === k ? 'on' : ''}">${n}</button>`).join('');
  let body;
  if (topScope === 'city' && !ME.city) body = `<div class="card"><p>Выбери город, чтобы попасть в его рейтинг и приносить ему очки.</p><button class="btn" data-act="pickCity">Выбрать город</button></div>`;
  else if (!topData || topData.scope !== topScope) body = `<p class="muted" style="text-align:center;padding:30px">Загружаем…</p>`;
  else if (topScope === 'cities') body = `<div class="list">${topData.rows.map((r, i) => `<div class="lb ${r.city === ME.city ? 'me' : ''}"><span class="n">${i + 1}</span><span class="who">${esc(r.city)} <small>· ${r.players} игр.</small></span><span class="v">${G.fmt(r.total)} ${C}</span></div>`).join('') || '<p class="muted" style="padding:16px">Пока никто не выбрал город. Будь первым.</p>'}</div>`;
  else {
    const inTop = topData.rows.some((r) => r.id === ME.id);
    body = `<div class="list">${topData.rows.map((r, i) => `<div class="lb ${r.id === ME.id ? 'me' : ''}"><span class="n">${i + 1}</span><span class="who">${r.badge === 'crown' ? '👑 ' : ''}${esc(r.name)}${r.city ? ` <small>· ${esc(r.city)}</small>` : ''}</span><span class="v">${G.fmt(r.total_earned)} ${C}</span></div>`).join('')}
      ${inTop ? '' : `<div class="lb me"><span class="n">${topData.me.rank}</span><span class="who">${esc(ME.name)} <small>· это ты</small></span><span class="v">${G.fmt(topData.me.total)} ${C}</span></div>`}</div>`;
  }
  return `<h2>Рейтинг</h2><p class="sub">По заработку за всё время. ${ME.city ? `Твой город: <b>${esc(ME.city)}</b>. <u data-act="pickCity">Сменить</u>` : ''}</p><div class="seg">${seg}</div>${body}`;
}
function loadTop() {
  if (topLoading || (topScope === 'city' && !ME.city)) return;
  topLoading = true;
  const scope = topScope;
  api('leaderboard', { scope }).then((j) => { topData = { ...j, scope }; }).catch(fail).finally(() => { topLoading = false; if (tab === 'top') renderOther(); });
}

function renderFriends() {
  return `<h2>Друзья</h2><p class="sub">Пригласи друга. Когда он купит 10 уровней, вы оба получите выручку за ${G.REF_REWARD_MIN} минут и доход ×2 на час.</p>
    <div class="card"><div class="row"><div><div class="muted">Приглашено друзей</div><div class="big">${S.ref.count}</div></div><div style="font-size:44px">🤝</div></div>
      <div class="linkbox">${esc(CFG.refLink)}</div>
      <button class="btn" data-act="invite">Позвать друга</button><button class="btn ghost" data-act="copy">Скопировать ссылку</button></div>
    <div class="card"><b>Как это работает</b><p class="muted" style="margin:6px 0 0">1. Друг открывает игру по твоей ссылке.<br>2. Покупает 10 уровней любых точек (это пара минут).<br>3. Награда приходит обоим автоматически, а бот пришлёт тебе сообщение.</p></div>`;
}

function renderOther() {
  const el = $('otherScreen');
  if (tab === 'franchise') el.innerHTML = renderFranchise();
  else if (tab === 'shop') el.innerHTML = renderShop();
  else if (tab === 'top') el.innerHTML = renderTop();
  else if (tab === 'friends') el.innerHTML = renderFriends();
}
function refresh() { if (!S) return; renderHud(); if (tab === 'biz') updateBiz(); else renderOther(); }

const screenActs = {
  prestige() {
    const pts = G.prestigePoints(S.runEarned);
    modal(`<div class="emoji">👑</div><h2>Продать сеть?</h2><p>Ты получишь <b>${pts} очков франшизы</b> (+${Math.round(pts * G.FRANCHISE_BONUS * 100)}% к доходу навсегда). Точки обнулятся, ты снова начнёшь с ларька и капитала 500 тыс ${C}, но расти будешь заметно быстрее.</p>
      <button class="btn" data-act="yes">Продать и начать заново</button><button class="btn ghost" data-act="close">Ещё поработаю</button>`, {
      yes() { closeModal(); api('prestige').then((j) => { haptic('ok'); toast(`Сеть продана: +${j.prestige.points} очков франшизы`); setTab('biz'); say('prestige'); }).catch(fail); },
    });
  },
  buyProduct(pid) {
    api('track', { type: 'shop_open' }).catch(() => {});
    api('invoice', { product: pid }).then((j) => {
      if (j.dev) {
        const p = G.PRODUCT[pid];
        return modal(`<div class="emoji">🧪</div><h2>Режим разработки</h2><p>Сервер запущен без токена бота, поэтому оплата Stars не открывается. Выдать «${esc(p.title)}» без оплаты?</p>
          <button class="btn" data-act="yes">Выдать для теста</button><button class="btn ghost" data-act="close">Отмена</button>`, {
          yes() { closeModal(); api('dev/pay', { product: pid }).then(() => { toast('Выдано'); refresh(); }).catch(fail); },
        });
      }
      tg.openInvoice(j.link, (status) => {
        if (status !== 'paid') return;
        haptic('ok'); toast('Оплата прошла, активируем покупку…');
        [1200, 3500, 8000].forEach((ms) => setTimeout(resync, ms));
      });
    }).catch(fail);
  },
  scope(k) { topScope = k; renderOther(); loadTop(); },
  pickCity() { cityModal(); },
  invite() { api('track', { type: 'invite' }).catch(() => {}); share('Открой свою шаурмичную и построй сеть по всему Казахстану 🌯 По моей ссылке дадут бонус на старте.'); },
  copy() { navigator.clipboard?.writeText(CFG.refLink).then(() => toast('Ссылка скопирована'), () => toast('Выдели ссылку и скопируй вручную')); },
};
$('otherScreen').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && screenActs[el.dataset.act]) screenActs[el.dataset.act](el.dataset.arg);
});

function setTab(t) {
  tab = t;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === t);
  $('bizScreen').hidden = t !== 'biz'; $('otherScreen').hidden = t === 'biz';
  document.querySelector('main').scrollTop = 0;
  refresh();
  if (t === 'top') loadTop();
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { haptic('light'); setTab(b.dataset.tab); } });

// ---------- окна: город, награда, ситуация ----------
function cityModal() {
  modal(`<h2>Твой город</h2><p>Твой заработок идёт в зачёт города в общем рейтинге.</p><div class="cities">${G.CITIES.map((c) => `<button data-act="set" data-arg="${esc(c)}">${esc(c)}</button>`).join('')}</div>`, {
    set(city) { closeModal(); api('city', { city }).then(() => { topData = null; toast(`Город: ${city}`); refresh(); if (tab === 'top') loadTop(); }).catch(fail); },
  });
}

function dailyModal() {
  const st = G.dailyStatus(S, now());
  const cur = ((st.streak - 1) % 7) + 1;
  const days = G.DAILY_MINUTES.map((m, i) => `<div class="${i + 1 < cur || (!st.available && i + 1 === cur) ? 'done' : i + 1 === cur ? 'now' : ''}">${i + 1}<br>${m >= 60 ? m / 60 + 'ч' : m + 'м'}</div>`).join('');
  modal(`<div class="emoji">🎁</div><h2>Ежедневная награда</h2><p>Заходи каждый день: награда растёт, а на 7-й день добавляется доход ×2 на 2 часа. Числа — это выручка за столько минут работы сети.</p>
    <div class="days">${days}</div>
    <button class="btn" data-act="claim" ${st.available ? '' : 'disabled'}>${st.available ? `Забрать день ${cur}` : 'Сегодня уже получено. Приходи завтра'}</button>`, {
    claim() { api('daily').then((j) => { haptic('ok'); closeModal(); toast(`+${G.fmt(j.daily.amount)} ${C}${j.daily.bonus ? ' и доход ×2 на 2 часа' : ''}`); refresh(); }).catch(fail); },
  });
}
$('dailyBtn').addEventListener('click', dailyModal);

function eventModal() {
  const ev = S.event; if (!ev) return;
  const free = G.isVip(S, now());
  const hintBtn = ev.hint != null ? '' : free || S.hints > 0
    ? `<button class="btn ghost" data-act="hint">💡 Совет консультанта ${free ? '(VIP: бесплатно)' : `(осталось ${S.hints})`}</button>`
    : `<button class="btn ghost" data-act="shop">💡 Советы закончились. В магазин</button>`;
  modal(`<div class="says">🧔🏽 Мага звонит с точки</div><h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p>
    ${ev.options.map((t, i) => `<button class="opt ${ev.hint === i ? 'hint' : ''}" data-act="choose" data-arg="${i}">${esc(t)}</button>`).join('')}${hintBtn}`, {
    hint() { api('event/hint').then(() => { haptic('ok'); eventModal(); }).catch(fail); },
    shop() { closeModal(); setTab('shop'); },
    choose(i) {
      api('event/choose', { choice: Number(i) }).then((j) => {
        const r = j.result;
        haptic(r.q === 'bad' ? 'heavy' : 'ok');
        const fx = [];
        if (r.money) fx.push(`<span class="${r.money > 0 ? 'good' : 'bad'}">${r.money > 0 ? '+' : '−'}${G.fmt(Math.abs(r.money))} ${C}</span>`);
        if (r.mult) fx.push(`<span class="${r.mult >= 1 ? 'good' : 'bad'}">Доход ×${String(r.mult).replace('.', ',')} на ${G.fmtDur(r.dur * 60)}</span>`);
        if (!fx.length) fx.push('<span>Без последствий</span>');
        const head = { best: ['🏆', 'Лучшее решение!'], ok: ['🤷', 'Сойдёт'], bad: ['💥', 'Плохое решение'] }[r.q];
        modal(`<div class="emoji">${head[0]}</div><h2>${head[1]}</h2><p>${esc(r.text)}</p><div class="effects">${fx.join('')}</div>
          ${r.q === 'best' ? (r.streak > 1 ? `<p class="amber">Серия лучших решений: ${r.streak} 🔥</p>` : '') : `<p class="muted">Лучше было: «${esc(r.best)}»</p>`}
          <button class="btn" data-act="close">Дальше</button>${r.q === 'best' ? '<button class="btn ghost" data-act="share">Похвастаться</button>' : ''}`, {
          share() { share(r.streak > 1 ? `${r.streak} лучших решений подряд в «${G.GAME_TITLE}» 🌯 Проверь, какой из тебя бизнесмен.` : `Разрулил ситуацию «${r.title}» лучшим способом в «${G.GAME_TITLE}» 🌯 А ты бы как поступил?`); },
        });
        say(r.q);
        refresh();
      }).catch(fail);
    },
  });
}
$('eventBanner').addEventListener('click', eventModal);

// ---------- цикл ----------
let hadEvent = false;
function tick() {
  if (!S) return;
  G.accrue(S, now());
  renderHud();
  if (tab === 'biz') updateBiz();
  if (!S.setup && $('modal').hidden) setupWizard();
  if (S.event && !hadEvent) { haptic('ok'); say('event'); if (S.ev.total === 0 && $('modal').hidden) eventModal(); }
  hadEvent = !!S.event;
}
function syncLoop() {
  if (!S || document.hidden) return;
  const idle = Date.now() - lastSync;
  if ((pendingTaps > 0 && idle > 4000) || idle > 15000) api('sync').then(() => { if (tab !== 'biz' && tab !== 'top' && $('modal').hidden) renderOther(); }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (pendingTaps) api('sync').catch(() => {}); return; }
  if (!S) return;
  if (Date.now() - hiddenAt > 5 * 60e3) api('state').then((j) => { showOffline(j.offline); refresh(); }).catch(() => {});
  else resync();
});

function showOffline(o) {
  if (!o || !(o.earned >= 1) || !$('modal').hidden) return;
  const cap = G.offlineCapSec(S, now());
  modal(`<div class="emoji">💰</div><h2>Пока тебя не было</h2><p>Точки отработали <b>${G.fmtDur(o.sec)}</b> и принесли</p>
    <div class="big good" style="text-align:center;margin-bottom:12px">+${G.fmt(o.earned)} ${C}</div>
    ${o.capped ? `<p class="muted">Касса вмещает выручку только за ${G.fmtDur(cap)}. ${S.manager || G.isVip(S, now()) ? '' : 'Управляющий в магазине увеличит её до 12 часов.'}</p>` : ''}
    <button class="btn" data-act="close">Забрать</button>${o.capped && !S.manager ? '<button class="btn ghost" data-act="shop">В магазин</button>' : ''}`, { shop() { closeModal(); setTab('shop'); } });
}

async function boot() {
  try { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#14100d'); tg?.setBackgroundColor?.('#14100d'); tg?.disableVerticalSwipes?.(); } catch {}
  const sp = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('sp') || '';
  let j;
  try { j = await api('state', { sp }); } catch (e) {
    $('loadingText').textContent = e.code === 'bad_init_data' ? 'Открой игру через Telegram: в боте нажми «Играть».' : e.code === 'network' ? 'Нет связи с сервером. Проверь интернет и открой игру заново.' : 'Не получилось загрузить игру. Попробуй открыть её заново.';
    return;
  }
  CFG = j.config;
  buildBiz();
  $('loading').hidden = true; $('app').hidden = false;
  refresh();
  setInterval(tick, 200);
  setInterval(() => sceneTick(150), 150);
  for (let i = 0; i < 2; i++) setTimeout(spawnCustomer, 300 + i * 700);
  setInterval(syncLoop, 1000);
  if (j.isNew) {
    modal(`<div class="emoji">🌯</div><h2>Знакомься, это Мага</h2><p>Мага пятнадцать лет стоит у гриля и делает лучший донер в городе. Ты хозяин, он мастер. У тебя 500 тысяч тенге стартового капитала. Выбери место, аппарат и мясо, поставь цену на донер и расти сеть. Тап по ларьку обслуживает клиента.</p><p>Иногда на точках случаются ситуации. От твоего решения зависит доход.</p>
      <button class="btn" data-act="close">Начать</button>`);
  } else { showOffline(j.offline); if (j.offline) setTimeout(() => say('back'), 600); }
}
boot();
