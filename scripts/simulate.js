// Симуляция темпа игры: «жадный» активный игрок без покупок за Stars.
// Запуск: node scripts/simulate.js [тапов_в_секунду]
import * as G from '../shared/game.js';

const tps = Number(process.argv[2] ?? 3);
const [loc, equip, meat] = (process.argv[3] ?? 'bus,new,chicken').split(',');
const s = G.newState(0);
console.log('Старт:', loc, equip, meat, G.applySetup(s, loc, equip, meat));
let t = 0;
const unlockedAt = {};
const marks = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 480];
const pointMarks = [1, 5, 10, 20, 40];
const pointAt = {};

function bestBuy() {
  let best = null;
  for (const b of G.BUSINESSES) {
    if (!G.isUnlocked(s, b.id)) continue;
    const level = G.lvl(s, b.id);
    const cost = G.costFor(b, level, 1);
    const gain = G.bizIncome(b, level + 1) - G.bizIncome(b, level);
    const payback = cost / gain;
    if (!best || payback < best.payback) best = { id: b.id, cost, payback };
  }
  return best;
}

console.log(`Активный игрок, ${tps} тапа/с, без Stars\n`);
while (t < 8 * 3600) {
  t += 1;
  G.setPrice(s, G.priceInfo(s).best);
  G.accrue(s, t * 1000);
  G.applyTaps(s, tps, t * 1000);
  for (let i = 0; i < 50; i++) {
    const b = bestBuy();
    if (!b || b.cost > s.money) break;
    G.buy(s, b.id, 1);
    if (G.lvl(s, b.id) === 1 && !unlockedAt[b.id]) unlockedAt[b.id] = t;
  }
  const pts = G.prestigePoints(s.runEarned);
  for (const p of pointMarks) if (pts >= p && !pointAt[p]) pointAt[p] = t;
  if (marks.includes(t / 60)) {
    console.log(`${String(t / 60).padStart(4)} мин: доход ${G.fmtRate(G.incomeAt(s, t * 1000)).padStart(10)} ₸/с, заработано ${G.fmt(s.runEarned).padStart(10)}, очков франшизы ${pts}, уровни: ${G.BUSINESSES.map((b) => G.lvl(s, b.id)).join('/')}`);
  }
}
console.log('\nОткрытие точек (мин):', Object.fromEntries(Object.entries(unlockedAt).map(([k, v]) => [k, +(v / 60).toFixed(1)])));
console.log('Очки франшизы (мин):', Object.fromEntries(Object.entries(pointAt).map(([k, v]) => [k, +(v / 60).toFixed(1)])));
