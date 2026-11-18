// Симуляция темпа игры без покупок за Stars.
// node scripts/simulate.js [active|casual] [место,аппарат,мясо] [скорость]
//   active — играет без перерыва 8 часов, 3 тапа в секунду;
//   casual — заходит 6 раз в день на 5 минут, касса 2 часа, 21 реальный день.
import * as G from '../shared/game.js';

const mode = process.argv[2] || 'casual';
const [loc, equip, meat] = (process.argv[3] || 'bus,new,chicken').split(',');
const speed = Number(process.argv[4] || 2);
const s = G.newState(0);
G.applySetup(s, loc, equip, meat);
s.g.speed = speed;
const unlocked = {}, pts = {};
const fmtT = (t) => (mode === 'active' ? `${(t / 60).toFixed(0)} мин` : `д${(t / 86400 + 1).toFixed(1)}`);

function greedy(t) {
  G.setPrice(s, G.priceInfo(s).best);
  for (let i = 0; i < 500; i++) {
    let best = null;
    for (const b of G.BUSINESSES) {
      if (!G.isUnlocked(s, b.id)) continue;
      const lv = G.lvl(s, b.id), cost = G.costFor(b, lv, 1), gain = G.bizIncome(b, lv + 1) - G.bizIncome(b, lv);
      const pay = cost / gain;
      if (!best || pay < best.pay) best = { id: b.id, cost, pay };
    }
    if (!best || best.cost > s.money) break;
    G.buy(s, best.id, 1);
    if (G.lvl(s, best.id) === 1 && unlocked[best.id] == null) unlocked[best.id] = t;
  }
  const p = G.prestigePoints(s.runEarned);
  for (const m of [1, 10, 20]) if (p >= m && pts[m] == null) pts[m] = t;
}

function online(t0, sec, tps) {
  for (let t = t0 + 1; t <= t0 + sec; t++) {
    s.g.activeUntil = t * 1000 + G.ACTIVE_WINDOW_MS;
    G.accrue(s, t * 1000);
    G.applyTaps(s, tps, t * 1000);
    if (t % 5 === 0) greedy(t);
  }
}

const report = [];
if (mode === 'active') {
  online(0, 8 * 3600, 3);
} else {
  const sessionsPerDay = 6, sessionSec = 300, gap = 86400 / sessionsPerDay;
  for (let d = 0; d < 21; d++) for (let k = 0; k < sessionsPerDay; k++) {
    const t0 = d * 86400 + k * gap;
    s.g.activeUntil = 0;
    G.accrue(s, t0 * 1000);
    greedy(t0);
    online(t0, sessionSec, 2);
    if (k === 0) report.push(`день ${d + 1}: доход ${G.fmtRate(G.baseIncome(s))} ₸/с, игр. день ${G.gameDay(s)}, уровни ${G.BUSINESSES.map((b) => G.lvl(s, b.id)).join('/')}`);
  }
}
console.log(`${mode}, ${loc}/${equip}/${meat}, скорость ${speed}x`);
if (report.length) console.log(report.filter((_, i) => [0, 1, 2, 4, 6, 9, 13, 20].includes(i)).join('\n'));
console.log('Открытие точек:', Object.entries(unlocked).map(([k, v]) => `${k} ${fmtT(v)}`).join(', '));
console.log('Очки франшизы:', Object.entries(pts).map(([k, v]) => `${k} → ${fmtT(v)}`).join(', ') || 'нет');
