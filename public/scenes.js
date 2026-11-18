// Сцены заведений: фон (SVG), работники и поведение посетителей. Координаты SVG: 360 × 190.
import * as G from '/shared/game.js';

const SKIN = ['#f6d3b3', '#f1c9a5', '#e0ac7e', '#c98f62', '#a9744f'];
const HAIR = ['#1d1410', '#3a2a1c', '#6b4a2a', '#c9a45a', '#8a8a8a'];
const TEXT = 'font-family="system-ui,sans-serif" font-weight="800" text-anchor="middle"';

// Человек в полный рост: cx — центр, y — уровень ног, k — масштаб (рост около 80·k).
export function person(look, cx, y, k = 1, cls = '') {
  if (look === 'maga') look = { skin: 3, hair: 0, shirt: '#f3ede2', apron: '#ffb22e', hat: 'chef', beard: true, brows: true };
  const skin = SKIN[look.skin ?? 1], hair = HAIR[look.hair ?? 0], shirt = look.shirt || '#6fb6ff';
  const p = [];
  p.push(`<rect x="-9" y="-26" width="7" height="26" rx="3" fill="#2b2b3a"/><rect x="2" y="-26" width="7" height="26" rx="3" fill="#2b2b3a"/>`);
  p.push(`<line x1="-14" y1="-46" x2="-18" y2="-26" stroke="${skin}" stroke-width="6" stroke-linecap="round"/><line x1="14" y1="-46" x2="18" y2="-26" stroke="${skin}" stroke-width="6" stroke-linecap="round"/>`);
  p.push(`<rect x="-15" y="-54" width="30" height="32" rx="9" fill="${shirt}"/>`);
  if (look.apron) p.push(`<rect x="-9" y="-46" width="18" height="24" rx="3" fill="${look.apron}"/>`);
  if (look.long) p.push(`<rect x="-14" y="-74" width="28" height="26" rx="8" fill="${hair}"/>`);
  p.push(`<circle cx="0" cy="-66" r="12" fill="${skin}"/>`);
  if (look.beard) p.push(`<path d="M-12 -66q0 18 12 20q12-2 12-20q-5 7-12 7t-12-7z" fill="${HAIR[look.hair ?? 0]}"/><path d="M-4 -56q4 3 8 0" stroke="#f7efe4" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
  else p.push(`<path d="M-4 -59q4 3 8 0" stroke="#5a2a1a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
  p.push(`<circle cx="-4.5" cy="-67" r="1.6" fill="#1d1410"/><circle cx="4.5" cy="-67" r="1.6" fill="#1d1410"/>`);
  if (look.brows) p.push(`<path d="M-8 -72l5 1M3 -71l5-1" stroke="#1d1410" stroke-width="1.6" stroke-linecap="round"/>`);
  if (look.hat === 'chef') p.push(`<ellipse cx="0" cy="-84" rx="13" ry="8" fill="#fff"/><rect x="-11" y="-84" width="22" height="9" rx="3" fill="#fff"/>`);
  else if (look.hat === 'cap') p.push(`<path d="M-12 -70a12 12 0 0 1 24 0z" fill="${shirt}"/><rect x="0" y="-72" width="17" height="4" rx="2" fill="${shirt}"/>`);
  else if (look.hat === 'helmet') p.push(`<path d="M-13 -68a13 13 0 0 1 26 0z" fill="#ffb22e"/><rect x="-14" y="-70" width="28" height="4" rx="2" fill="#e0901a"/>`);
  else p.push(`<path d="M-12 -68a12 12 0 0 1 24 0q-6-4-12-4t-12 4z" fill="${hair}"/>`);
  return `<g class="worker ${cls}" transform="translate(${cx} ${y}) scale(${k})">${p.join('')}</g>`;
}

function sign(x, y, w, text, color = '#ffb22e', bg = '#201610') {
  return `<rect x="${x}" y="${y}" width="${w}" height="22" rx="6" fill="${bg}" stroke="${color}" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 15.5}" font-size="11.5" fill="${color}" ${TEXT}>${text}</text>`;
}
const sky = (x, y, w, h) => `<rect class="sky" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const placeStaff = (staff, slots) => staff.slice(0, slots.length).map((w, i) => person(w.look, ...slots[i])).join('');

// ---------- сцены ----------
function kiosk(staff) {
  const extra = staff.slice(1);
  return `
  <g class="stars" fill="#fff"><circle cx="210" cy="24" r="1.2"/><circle cx="262" cy="46" r="1"/><circle cx="318" cy="20" r="1.3"/><circle cx="342" cy="62" r="1"/><circle cx="236" cy="70" r=".9"/></g>
  <circle class="sun" cx="318" cy="36" r="15"/>
  <g fill="#000" opacity=".18"><rect x="196" y="96" width="30" height="66"/><rect x="230" y="78" width="24" height="84"/><rect x="258" y="104" width="36" height="58"/><rect x="298" y="88" width="26" height="74"/><rect x="328" y="110" width="32" height="52"/></g>
  <rect x="0" y="160" width="360" height="30" fill="#2b2622"/><rect x="0" y="160" width="360" height="3" fill="#4a4038"/>
  <rect x="18" y="60" width="154" height="102" fill="#3a2a1c"/><rect x="26" y="70" width="138" height="56" rx="4" fill="#241a12"/>
  <g class="lamp"><circle cx="40" cy="76" r="20" fill="#ffb22e" opacity=".22"/><circle cx="40" cy="76" r="4" fill="#ffe2a0"/></g>
  <rect x="158" y="76" width="6" height="46" rx="2" fill="#ff5a36" class="heat"/>
  <line x1="142" y1="68" x2="142" y2="126" stroke="#c9c2b8" stroke-width="3"/>
  <path d="M129 78h26l-5 42h-16z" fill="#a5562a"/><path d="M133 86h18M134 96h16M135 106h14" stroke="#7a3a18" stroke-width="2.5"/>
  ${extra[0] ? person(extra[0].look, 38, 150, 0.78) : ''}${extra[1] ? person(extra[1].look, 114, 150, 0.72) : ''}
  <g class="maga">
    <rect x="58" y="98" width="44" height="34" rx="9" fill="#f3ede2"/><rect x="69" y="106" width="22" height="26" rx="3" fill="#ffb22e"/>
    <line x1="62" y1="104" x2="52" y2="122" stroke="#c98f62" stroke-width="7" stroke-linecap="round"/>
    <g id="magaArm"><line x1="98" y1="104" x2="120" y2="108" stroke="#c98f62" stroke-width="7" stroke-linecap="round"/><line x1="121" y1="107" x2="136" y2="96" stroke="#e6e1d8" stroke-width="3.5" stroke-linecap="round"/></g>
    <circle cx="80" cy="80" r="15" fill="#c98f62"/><path d="M65 80q0 22 15 24q15-2 15-24q-6 8-15 8t-15-8z" fill="#1d1410"/>
    <path d="M75 92q5 4 10 0" stroke="#f7efe4" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <circle cx="74" cy="77" r="1.9" fill="#1d1410"/><circle cx="86" cy="77" r="1.9" fill="#1d1410"/>
    <path d="M70 72l7 1M83 73l7-1" stroke="#1d1410" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="80" cy="60" rx="16" ry="9" fill="#fff"/><rect x="66" y="60" width="28" height="9" rx="3" fill="#fff"/>
  </g>
  <rect x="12" y="126" width="168" height="8" rx="2" fill="#8a5a2a"/><rect x="16" y="134" width="160" height="28" fill="#5a3a1e"/>
  <g>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${8 + i * 22}" y="46" width="22" height="18" fill="${i % 2 ? '#ffb22e' : '#ff5a36'}"/>`).join('')}</g>
  ${sign(36, 18, 118, 'ДОНЕР У МАГИ')}`;
}

function mall(staff) {
  return `
  <rect x="0" y="0" width="360" height="190" fill="#352d40"/>
  <rect x="0" y="0" width="360" height="14" fill="#2a2333"/>${[40, 120, 200, 280].map((x) => `<rect x="${x}" y="10" width="40" height="5" rx="2" fill="#fff6d0" class="glow"/>`).join('')}
  <g>${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 30}" y="160" width="30" height="30" fill="${i % 2 ? '#d9d2c6' : '#c4bcae'}"/>`).join('')}</g>
  <rect x="12" y="34" width="180" height="128" rx="6" fill="#241c2c"/>
  <rect x="24" y="44" width="156" height="34" rx="4" fill="#120e16"/>
  <text x="102" y="58" font-size="10" fill="#ffb22e" ${TEXT}>МЕНЮ</text><text x="102" y="72" font-size="9" fill="#f7efe4" ${TEXT} font-weight="600">донер · ролл · айран · комбо</text>
  ${placeStaff(staff, [[60, 150, 0.85], [104, 150, 0.85], [148, 150, 0.85]])}
  <rect x="8" y="118" width="188" height="44" rx="4" fill="#ff5a36"/><rect x="8" y="118" width="188" height="7" rx="3" fill="#ffb22e"/>
  <rect x="160" y="104" width="22" height="14" rx="3" fill="#2b2b3a"/><rect x="163" y="106" width="16" height="7" fill="#5fd88f"/>
  ${sign(44, 20, 116, 'МАГА · ТРЦ')}
  <rect x="214" y="40" width="64" height="120" rx="4" fill="#4a5a70"/><rect x="220" y="48" width="52" height="70" fill="#a8c6e8" opacity=".55"/>
  <rect x="290" y="40" width="64" height="120" rx="4" fill="#5a4a60"/><rect x="296" y="48" width="52" height="70" fill="#e8c6d8" opacity=".5"/>
  <text x="246" y="134" font-size="9" fill="#fff" ${TEXT}>ОБУВЬ</text><text x="322" y="134" font-size="9" fill="#fff" ${TEXT}>КИНО</text>
  <circle cx="204" cy="150" r="9" fill="#2f7a4a"/><rect x="200" y="152" width="8" height="10" fill="#6b4a2a"/>`;
}

function hall(staff, v) {
  const R = v === 'restaurant';
  const wall = R ? '#3a1418' : '#6a4630', trim = R ? '#c9a45a' : '#8a5a2a', floor = R ? '#2a1a14' : '#9a6a40';
  const tables = [212, 266, 320].map((x) => `
    <rect x="${x - 14}" y="146" width="6" height="18" fill="${R ? '#5a2a1a' : '#5a3a1e'}"/><rect x="${x + 8}" y="146" width="6" height="18" fill="${R ? '#5a2a1a' : '#5a3a1e'}"/>
    <rect x="${x - 2}" y="140" width="4" height="24" fill="#3a2a1c"/>
    <ellipse cx="${x}" cy="140" rx="20" ry="5" fill="${R ? '#f7efe4' : '#c98f62'}"/>${R ? `<rect x="${x - 20}" y="140" width="40" height="9" fill="#f7efe4"/>` : ''}
    <circle cx="${x + 6}" cy="136" r="2.5" fill="${R ? '#ff5a36' : '#fff'}"/>`).join('');
  const deco = R
    ? [120, 260].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="20" stroke="#c9a45a"/><circle cx="${x}" cy="24" r="8" fill="#ffe2a0" class="glow"/><circle cx="${x}" cy="24" r="16" fill="#ffb22e" opacity=".18"/>`).join('')
    : [150, 290].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="18" stroke="#2b2b3a"/><path d="M${x - 9} 26h18l-4-9h-10z" fill="#2b2b3a"/><circle cx="${x}" cy="28" r="10" fill="#ffd27a" opacity=".3" class="glow"/>`).join('');
  return `
  <rect x="0" y="0" width="360" height="190" fill="${wall}"/>
  ${R ? Array.from({ length: 18 }, (_, i) => `<rect x="${i * 20 + 8}" y="0" width="2" height="150" fill="#000" opacity=".15"/>`).join('') : ''}
  ${sky(200, 30, 60, 62)}${sky(280, 30, 60, 62)}
  <rect x="200" y="30" width="60" height="62" fill="none" stroke="${trim}" stroke-width="4"/><rect x="280" y="30" width="60" height="62" fill="none" stroke="${trim}" stroke-width="4"/>
  <line x1="230" y1="30" x2="230" y2="92" stroke="${trim}" stroke-width="2"/><line x1="310" y1="30" x2="310" y2="92" stroke="${trim}" stroke-width="2"/>
  ${deco}
  <rect x="0" y="150" width="360" height="40" fill="${floor}"/><rect x="0" y="150" width="360" height="3" fill="${trim}"/>
  ${R ? '<rect x="12" y="56" width="150" height="56" rx="4" fill="#1d0c0e"/><rect x="18" y="62" width="138" height="44" fill="#ffb22e" opacity=".12"/>' : '<rect x="12" y="40" width="120" height="16" rx="3" fill="#3a2a1c"/><text x="72" y="52" font-size="9" fill="#ffd27a" ' + TEXT + '>КОФЕ · ДОНЕР · ДЕСЕРТЫ</text>'}
  ${placeStaff(staff.slice(0, 2), [[46, 146, 0.85], [110, 146, 0.85]])}
  <rect x="8" y="112" width="${R ? 160 : 132}" height="40" rx="3" fill="${R ? '#5a1a20' : '#5a3a1e'}"/><rect x="8" y="112" width="${R ? 160 : 132}" height="6" fill="${trim}"/>
  ${R ? '' : '<rect x="100" y="94" width="22" height="18" rx="3" fill="#c9c2b8"/><rect x="104" y="98" width="14" height="6" fill="#2b2b3a"/>'}
  ${tables}
  ${staff[2] ? person(staff[2].look, 176, 172, 0.8) : ''}${staff[3] ? person(staff[3].look, 240, 176, 0.78) : ''}
  ${R ? sign(20, 22, 140, 'РЕСТОРАН «У МАГИ»', '#c9a45a', '#1d0c0e') : sign(204, 6, 132, 'КАФЕ «У МАГИ»')}`;
}

function fleet(staff, v) {
  const C = v === 'cities', W = v === 'world';
  const building = W
    ? `<rect x="22" y="40" width="70" height="122" fill="#2b3a52"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${30 + (i % 3) * 20}" y="${50 + Math.floor(i / 3) * 22}" width="12" height="12" fill="#ffe2a0" class="win"/>`).join('')}
       <g class="globe"><circle cx="150" cy="98" r="40" fill="#2f6fb0"/><path d="M118 80q18 10 30-4t26 6M114 104q22-6 34 6t30-2M132 126q10-10 26-4" stroke="#5fd88f" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="150" cy="98" rx="40" ry="14" fill="none" stroke="#fff" stroke-opacity=".3"/><line x1="150" y1="58" x2="150" y2="138" stroke="#fff" stroke-opacity=".3"/></g>
       <rect x="146" y="138" width="8" height="24" fill="#555"/>`
    : `<rect x="14" y="${C ? 60 : 54}" width="${C ? 150 : 132}" height="${C ? 102 : 108}" fill="${C ? '#5a6470' : '#7a3a20'}"/>
       <rect x="${C ? 22 : 20}" y="${C ? 96 : 70}" width="${C ? 60 : 50}" height="${C ? 66 : 34}" fill="${C ? '#3a424c' : '#241a12'}"/>
       ${C ? Array.from({ length: 6 }, (_, i) => `<rect x="22" y="${100 + i * 10}" width="60" height="2" fill="#2a2f36"/>`).join('') : ''}
       <rect x="${C ? 96 : 84}" y="${C ? 76 : 70}" width="${C ? 54 : 50}" height="34" fill="#241a12"/><rect x="${C ? 99 : 87}" y="${C ? 79 : 73}" width="${C ? 48 : 44}" height="28" class="sky" opacity=".35"/>
       <rect x="${C ? 24 : 78}" y="${C ? 70 : 118}" width="${C ? 0.01 : 50}" height="44" fill="#3a2a1c"/>`;
  const label = W ? 'MAGA DONER INTERNATIONAL' : C ? 'МАГА ЛОГИСТИК' : 'МАГА ДОСТАВКА';
  const inWindow = W ? [] : [[C ? 123 : 110, C ? 120 : 114, 0.62]];
  const outside = W ? [[56, 176, 0.72], [100, 178, 0.7], [200, 178, 0.7]] : [[C ? 186 : 160, 176, 0.72], [C ? 222 : 196, 178, 0.7], [C ? 258 : 232, 178, 0.7]];
  const people = W ? staff : [staff[0], ...staff.slice(1)];
  return `
  <g class="stars" fill="#fff"><circle cx="210" cy="24" r="1.2"/><circle cx="262" cy="46" r="1"/><circle cx="318" cy="20" r="1.3"/><circle cx="342" cy="62" r="1"/></g>
  <circle class="sun" cx="318" cy="36" r="15"/>
  ${C ? '<path d="M150 150l60-62 40 34 36-48 74 76z" fill="#000" opacity=".2"/>' : '<g fill="#000" opacity=".16"><rect x="210" y="96" width="30" height="64"/><rect x="246" y="80" width="26" height="80"/><rect x="280" y="104" width="36" height="56"/><rect x="322" y="88" width="30" height="72"/></g>'}
  <rect x="0" y="158" width="360" height="32" fill="#2b2622"/><g>${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 40 + 8}" y="173" width="22" height="2.5" fill="#f7efe4" opacity=".6"/>`).join('')}</g>
  ${building}
  ${placeStaff(people.slice(0, inWindow.length), inWindow)}
  ${W ? '' : `<rect x="${C ? 96 : 84}" y="${C ? 108 : 102}" width="${C ? 54 : 50}" height="5" fill="#8a5a2a"/>`}
  ${placeStaff(people.slice(inWindow.length), outside)}
  ${sign(W ? 100 : 22, W ? 8 : C ? 34 : 28, W ? 170 : C ? 128 : 116, label, '#ffb22e')}`;
}

function plant(staff) {
  return `
  <rect x="0" y="0" width="360" height="190" fill="#2e3540"/>
  ${[20, 110, 200, 290].map((x) => `${sky(x, 14, 56, 30)}<rect x="${x}" y="14" width="56" height="30" fill="none" stroke="#1d2229" stroke-width="3"/><line x1="${x + 28}" y1="14" x2="${x + 28}" y2="44" stroke="#1d2229" stroke-width="2"/>`).join('')}
  <rect x="0" y="160" width="360" height="30" fill="#4a525c"/><g>${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 30 + 4}" y="176" width="16" height="3" fill="#ffb22e" opacity=".6"/>`).join('')}</g>
  <rect x="268" y="60" width="74" height="70" rx="4" fill="#5a6470"/><rect x="278" y="70" width="54" height="22" fill="#1d2229"/><circle cx="292" cy="108" r="8" fill="#ff5a36" class="glow"/><circle cx="318" cy="108" r="8" fill="#5fd88f"/>
  <text x="305" y="85" font-size="8" fill="#5fd88f" ${TEXT}>ЛАВАШ 98%</text>
  <rect x="10" y="64" width="56" height="66" rx="4" fill="#6a5a40"/><path d="M18 74h40v20h-40z" fill="#c9a45a"/><text x="38" y="88" font-size="7.5" fill="#2b2b3a" ${TEXT}>СОУС</text>
  ${placeStaff(staff, [[96, 146, 0.8], [168, 146, 0.8], [232, 146, 0.8], [130, 146, 0.78]])}
  <rect x="20" y="124" width="320" height="10" rx="4" fill="#1d2229"/>${Array.from({ length: 16 }, (_, i) => `<circle cx="${28 + i * 20}" cy="129" r="3.5" fill="#8a929c" class="roller"/>`).join('')}
  <rect x="24" y="134" width="6" height="26" fill="#1d2229"/><rect x="330" y="134" width="6" height="26" fill="#1d2229"/><rect x="176" y="134" width="6" height="26" fill="#1d2229"/>
  ${sign(118, 52, 124, 'ЦЕХ ЛАВАША «МАГА»', '#5fd88f', '#1d2229')}`;
}

// layout: queue — очередь к прилавку, hall — гости садятся за столы, fleet — машины уезжают, plant — коробки едут по ленте
export const SCENES = {
  kiosk: { layout: 'queue', draw: kiosk, short: 'Ларёк', queueX: 52 },
  mall: { layout: 'queue', draw: mall, short: 'ТРЦ', queueX: 57 },
  cafe: { layout: 'hall', draw: (s) => hall(s, 'cafe'), short: 'Кафе', seats: [[56, 70], [61, 70], [71, 70], [76, 70], [86, 70], [91, 70]] },
  delivery: { layout: 'fleet', draw: (s) => fleet(s, 'delivery'), short: 'Доставка', vehicle: 'scooter', from: 28, lane: 6 },
  restaurant: { layout: 'hall', draw: (s) => hall(s, 'restaurant'), short: 'Ресторан', seats: [[56, 70], [61, 70], [71, 70], [76, 70], [86, 70], [91, 70]] },
  factory: { layout: 'plant', draw: plant, short: 'Цех' },
  cities: { layout: 'fleet', draw: (s) => fleet(s, 'cities'), short: 'Сеть', vehicle: 'truck', from: 22, lane: 4 },
  world: { layout: 'fleet', draw: (s) => fleet(s, 'world'), short: 'Мир', vehicle: 'plane', from: 30, lane: 62 },
};

export function sceneSvg(id, level) {
  return `<svg class="stage" viewBox="0 0 360 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${SCENES[id].draw(G.staffFor(id, Math.max(1, level)))}</svg>`;
}

// ---------- посетители, машины, коробки (HTML поверх SVG) ----------
const SHIRT = ['#6fb6ff', '#5fd88f', '#ff8a4a', '#d9a4ff', '#ffd27a', '#ff6f91', '#9aa7b8', '#f7efe4'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const guestSvg = () => `<svg viewBox="0 0 28 54"><rect x="8" y="38" width="5" height="15" rx="2.5" fill="#2b2b3a"/><rect x="15" y="38" width="5" height="15" rx="2.5" fill="#2b2b3a"/><rect x="5" y="18" width="18" height="23" rx="7" fill="${pick(SHIRT)}"/><circle cx="14" cy="9.5" r="8" fill="${pick(SKIN)}"/><path d="M6 9.5a8 8 0 0116 0z" fill="${pick(HAIR)}"/></svg>`;
const VEH = {
  scooter: () => `<svg viewBox="0 0 60 44"><circle cx="12" cy="36" r="7" fill="#1d1410"/><circle cx="48" cy="36" r="7" fill="#1d1410"/><path d="M10 30h34l6-10h6" stroke="#ff5a36" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="2" y="12" width="20" height="16" rx="3" fill="#ffb22e"/><text x="12" y="24" font-size="9" text-anchor="middle" font-weight="900" fill="#2a1a00">M</text><circle cx="32" cy="8" r="6" fill="#ffb22e"/><rect x="27" y="13" width="10" height="14" rx="3" fill="#ffb22e"/></svg>`,
  truck: () => `<svg viewBox="0 0 96 46"><rect x="2" y="6" width="62" height="30" rx="3" fill="#f7efe4"/><text x="33" y="26" font-size="11" text-anchor="middle" font-weight="900" fill="#ff5a36">МАГА</text><path d="M64 14h18l12 12v10H64z" fill="#ff5a36"/><rect x="70" y="17" width="12" height="8" fill="#a8c6e8"/><circle cx="18" cy="38" r="7" fill="#1d1410"/><circle cx="50" cy="38" r="7" fill="#1d1410"/><circle cx="80" cy="38" r="7" fill="#1d1410"/></svg>`,
  plane: () => `<svg viewBox="0 0 90 34"><path d="M6 17q0-6 10-6h56l14 6-14 6H16q-10 0-10-6z" fill="#f7efe4"/><path d="M40 11l-12-10h8l18 10zM40 23l-12 10h8l18-10z" fill="#ff5a36"/><path d="M8 11l-6-9h6l8 9z" fill="#ffb22e"/><circle cx="64" cy="17" r="2" fill="#6fb6ff"/><circle cx="56" cy="17" r="2" fill="#6fb6ff"/><circle cx="48" cy="17" r="2" fill="#6fb6ff"/></svg>`,
};
const boxSvg = () => `<svg viewBox="0 0 30 22"><rect x="1" y="1" width="28" height="20" rx="3" fill="#c9a45a"/><path d="M1 8h28" stroke="#8a6a2a"/><text x="15" y="17" font-size="7" text-anchor="middle" font-weight="900" fill="#5a3a1e">ЛАВАШ</text></svg>`;

export function createCrowd(layer, onServe) {
  let cfg = null, items = [], seats = [];
  const add = (cls, html, left, bottom) => {
    const el = document.createElement('div');
    el.className = cls; el.innerHTML = html; el.style.left = left + '%'; el.style.bottom = bottom + '%';
    layer.appendChild(el);
    return el;
  };
  const later = (fn, ms) => setTimeout(fn, ms);
  const remove = (el, ms) => later(() => el.remove(), ms);

  const api = {
    use(id) {
      layer.innerHTML = ''; items = []; cfg = SCENES[id];
      seats = (cfg.seats || []).map((p) => ({ p, el: null }));
    },
    spawn() {
      if (!cfg) return;
      if (cfg.layout === 'queue') {
        if (items.length >= 4) return;
        const el = add('cust', guestSvg(), 104, 7);
        const c = { el };
        items.push(c);
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = cfg.queueX + items.indexOf(c) * 10.5 + '%'; }));
        c.t = later(() => el.classList.add('wait'), 1150);
      } else if (cfg.layout === 'hall') {
        const free = seats.filter((s) => !s.el);
        if (!free.length) return;
        const seat = pick(free);
        const el = add('cust', guestSvg(), 104, 4);
        seat.el = el;
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = seat.p[0] + '%'; }));
        later(() => { el.classList.add('wait', 'sit'); el.style.bottom = '9%'; }, 1150);
        seat.t = later(() => api.leaveSeat(seat), 5000 + Math.random() * 5000);
      } else if (cfg.layout === 'fleet') {
        if (items.length >= 3) return;
        const el = add('veh ' + cfg.vehicle, VEH[cfg.vehicle](), cfg.from, cfg.lane);
        items.push(el);
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = '112%'; }));
        later(() => { el.remove(); items = items.filter((x) => x !== el); }, 2700);
      } else if (cfg.layout === 'plant') {
        if (items.length >= 5) return;
        const el = add('box', boxSvg(), 6, 30);
        items.push(el);
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = '86%'; }));
        later(() => { el.classList.add('done'); }, 3000);
        later(() => { el.remove(); items = items.filter((x) => x !== el); }, 3400);
      }
    },
    leaveSeat(seat) {
      if (!seat.el) return false;
      clearTimeout(seat.t);
      const el = seat.el; seat.el = null;
      el.classList.remove('wait', 'sit'); el.classList.add('leave'); el.style.bottom = '2%';
      el.insertAdjacentHTML('beforeend', '<span class="got">😋</span>');
      el.style.left = '108%';
      remove(el, 1600);
      return true;
    },
    // Обслужить следующего (на тап или по таймеру). Возвращает true, если кто-то обслужен.
    serve(byTap = false) {
      if (!cfg) return false;
      if (cfg.layout === 'queue') {
        const c = items[0];
        if (!c || (!byTap && !c.el.classList.contains('wait'))) return false;
        items.shift(); clearTimeout(c.t);
        c.el.classList.remove('wait'); c.el.classList.add('leave');
        c.el.insertAdjacentHTML('beforeend', '<span class="got">🌯</span>');
        c.el.style.left = '108%';
        remove(c.el, 1600);
        items.forEach((q, i) => { q.el.classList.remove('wait'); q.el.style.left = cfg.queueX + i * 10.5 + '%'; clearTimeout(q.t); q.t = later(() => q.el.classList.add('wait'), 600); });
        onServe?.();
        return true;
      }
      if (cfg.layout === 'hall') {
        if (!byTap) return false;
        const seat = seats.find((s) => s.el?.classList.contains('sit'));
        if (seat) { api.leaveSeat(seat); return true; }
        api.spawn();
        return false;
      }
      if (byTap) { api.spawn(); return true; }
      return false;
    },
    get layout() { return cfg?.layout; },
  };
  return api;
}

// Реплики работников по заведениям: первая строка — кто говорит.
export const LINES = {
  kiosk: ['Заходи, брат, донер свежий!', 'Мясо свежее, как утро в горах.', 'Соус мой, рецепт секретный.', 'Клиент сытый — Мага довольный.', 'Режем тонко, зарабатываем толсто.'],
  mall: ['Свободная касса!', 'Комбо с айраном — хит недели.', 'В ТРЦ сегодня аншлаг.'],
  cafe: ['Столик у окна свободен!', 'Капучино и донер — лучший завтрак.', 'Гости хвалят десерт.'],
  delivery: ['Заказ на Абая, лечу!', 'Горячий донер за 30 минут.', 'Ещё десять заказов в очереди.'],
  restaurant: ['Бронь на восемь персон.', 'Шеф рекомендует донер из ягнёнка.', 'Вечером будет полный зал.'],
  factory: ['Линия работает без остановок.', 'Тысяча лавашей в час!', 'Соус прошёл контроль качества.'],
  cities: ['Фура ушла в Шымкент.', 'Открываем точку в Актау.', 'Склад заполнен на 90%.'],
  world: ['Мага, звонят из Дубая.', 'Открываемся в Стамбуле.', 'Донер у Маги теперь в 12 странах.'],
};
