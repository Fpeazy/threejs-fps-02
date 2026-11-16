// The DOM HUD: minimap, score bar, kill feed, radio, vitals, weapon, crosshair,
// buy menu, plant bar, scoreboard, damage vignette, overlays. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out. Every
// setter is cached so the DOM is only written when a value changes.
import { WEAPONS, GRENADE, ARMOUR } from './weapons.js';

const COPY = {
  start: {
    title: 'NIGHT BAZAAR',
    copy: 'A dusk market, two teams, one charge. Plant it at SPICE ROW or TEA HOUSE — or hold the line. Click to play.',
    action: 'Click to play',
  },
  paused: { title: 'NIGHT BAZAAR', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  end: { title: 'Match over', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const grenadesEl = $('grenades');
  const hpFill = $('hp-fill');
  const hpNum = $('hp-num');
  const armourEl = $('armour');
  const cashEl = $('cash');
  const scoreEl = $('scorebar');
  const timerEl = $('timer');
  const roundEl = $('round');
  const phaseEl = $('phase');
  const killfeed = $('killfeed');
  const radioEl = $('radio');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const vignette = $('vignette');
  const toastEl = $('toast');
  const buyMenu = $('buymenu');
  const buyGrid = $('buy-grid');
  const buyTimer = $('buy-timer');
  const plantBar = $('plantbar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const scoreboard = $('scoreboard');
  const scoreTitle = $('score-title');
  const scoreBody = $('score-body');
  const scoreSub = $('score-sub');
  const minimap = $('minimap');
  const mm = minimap.getContext('2d');

  let lastAmmo = '';
  let lastVitals = '';
  let lastScore = '';
  let lastTimer = '';
  let hitTimer = 0;
  let toastTimer = 0;

  function feedLine(html) {
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.innerHTML = html;
    killfeed.prepend(div);
    while (killfeed.children.length > 4) killfeed.lastChild.remove();
    setTimeout(() => { div.classList.add('fade'); }, 5000);
    setTimeout(() => { div.remove(); }, 6000);
  }

  return {
    setAmmo(mag, reserve, name, grenades, slots) {
      const key = `${mag}|${reserve}|${name}|${grenades}|${slots}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      grenadesEl.textContent = `◉ ${grenades}`;
      ammo.classList.toggle('empty', mag === 0);
      document.querySelectorAll('#slots .slot').forEach((el, i) => {
        el.classList.toggle('on', slots[i] === true);
      });
    },
    setVitals(hp, armour, cash) {
      const key = `${hp}|${armour}|${cash}`;
      if (key === lastVitals) return;
      lastVitals = key;
      hpFill.style.width = `${Math.max(0, hp)}%`;
      hpFill.classList.toggle('low', hp <= 30);
      hpNum.textContent = String(Math.max(0, Math.ceil(hp)));
      armourEl.textContent = armour > 0 ? `⛨ ${armour}` : '';
      cashEl.textContent = `$${cash}`;
    },
    setScore(ember, lantern, round, timeLeft, phase) {
      const key = `${ember}|${lantern}|${round}|${Math.ceil(timeLeft)}|${phase}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreEl.innerHTML = `<span class="team ember">EMBER ${ember}</span><span class="sep">—</span><span class="team lantern">LANTERN ${lantern}</span>`;
      roundEl.textContent = `ROUND ${round}`;
      phaseEl.textContent = phase === 'BUY' ? 'BUY PHASE' : phase === 'LIVE' ? 'LIVE' : 'ROUND OVER';
      const t = Math.max(0, Math.ceil(timeLeft));
      timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      timerEl.classList.toggle('low', t <= 10 && phase === 'LIVE');
    },
    hitMarker(killed, headshot, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('hs', headshot);
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on', 'hs');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setSpread(px) {
      const g = Math.max(4, Math.min(26, px));
      crosshair.style.setProperty('--gap', `${g}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 220);
    },
    killfeed(killer, weapon, victim, headshot, killerTeam) {
      const kc = killerTeam === 'ember' ? 'ember' : 'lantern';
      feedLine(`<span class="${kc}">${killer}</span> <span class="w">[${weapon}]</span> <span>${victim}</span>${headshot ? ' <span class="hs">HS</span>' : ''}`);
    },
    radio(text, team) {
      const div = document.createElement('div');
      div.className = 'radio-line';
      div.innerHTML = `<span class="${team}">▸</span> ${text}`;
      radioEl.prepend(div);
      while (radioEl.children.length > 4) radioEl.lastChild.remove();
      setTimeout(() => { div.remove(); }, 7000);
    },
    toast(text, ms = 2600) {
      toastEl.textContent = text;
      toastEl.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
    },
    hideToast() {
      toastEl.classList.remove('on');
      clearTimeout(toastTimer);
    },
    drawMinimap(map, agents, playerYaw, seenAt) {
      const W = minimap.width;
      const H = minimap.height;
      const sx = W / 48;
      const sz = H / 36;
      const X = (x) => (x + 24) * sx;
      const Z = (z) => (z + 18) * sz;
      mm.clearRect(0, 0, W, H);
      mm.fillStyle = 'rgba(20, 16, 28, 0.85)';
      mm.fillRect(0, 0, W, H);
      mm.fillStyle = '#6e5238';
      for (const w of map.wallRects) mm.fillRect(X(w.x - w.w / 2), Z(w.z - w.d / 2), w.w * sx, w.d * sz);
      for (const key of ['A', 'B']) {
        const s = map.sites[key];
        mm.fillStyle = key === 'A' ? '#3d8a80' : '#c96a2e';
        mm.beginPath();
        mm.arc(X(s.x), Z(s.z), 7, 0, Math.PI * 2);
        mm.fill();
        mm.fillStyle = '#f5e6c8';
        mm.font = 'bold 9px system-ui';
        mm.textAlign = 'center';
        mm.fillText(key, X(s.x), Z(s.z) + 3);
      }
      mm.fillStyle = '#8a7f6a';
      mm.font = '8px system-ui';
      for (const c of map.callouts) {
        if (c.name === 'SPICE ROW' || c.name === 'TEA HOUSE') continue;
        mm.fillText(c.name, X(c.x), Z(c.z) - 6);
      }
      for (const a of agents) {
        if (!a.alive) continue;
        const isPlayer = a.kind === 'player';
        const seen = isPlayer || a.team === 'ember' || (seenAt && seenAt(a) > 0);
        if (!seen) continue;
        mm.fillStyle = isPlayer ? '#ffffff' : a.team === 'ember' ? '#c96a2e' : '#3d8a80';
        mm.beginPath();
        mm.arc(X(a.pos.x), Z(a.pos.z), isPlayer ? 4 : 3, 0, Math.PI * 2);
        mm.fill();
        if (isPlayer) {
          const fx = -Math.sin(playerYaw);
          const fz = -Math.cos(playerYaw);
          mm.strokeStyle = '#ffffff';
          mm.beginPath();
          mm.moveTo(X(a.pos.x), Z(a.pos.z));
          mm.lineTo(X(a.pos.x) + fx * 9, Z(a.pos.z) + fz * 9);
          mm.stroke();
        }
      }
    },
    showBuy(open, player, timeLeft) {
      buyMenu.hidden = !open;
      if (!open) return;
      buyTimer.textContent = `Buy closes in ${Math.max(0, Math.ceil(timeLeft))}s — press B to close`;
      const items = [];
      for (const [id, w] of Object.entries(WEAPONS)) items.push({ id, name: w.name, cat: w.cat, price: w.price, desc: `${w.damage} dmg · ${w.mag} mag · ${Math.round(60 / w.gap)} rpm`, owned: player.owned.has(id) });
      items.push({ id: 'grenade', name: GRENADE.name, cat: GRENADE.cat, price: GRENADE.price, desc: 'Frag · 120 dmg centre', owned: player.grenades > 0 });
      items.push({ id: 'armour', name: ARMOUR.name, cat: ARMOUR.cat, price: ARMOUR.price, desc: 'Absorbs 50% damage', owned: player.armour > 0 });
      const cats = ['Sidearms', 'Close range', 'Rifles', 'Grenades', 'Gear'];
      buyGrid.innerHTML = cats.map((cat) => `<div class="buy-cat"><h3>${cat}</h3>${items.filter((i) => i.cat === cat).map((i) => `<button class="buy-item${i.owned ? ' owned' : ''}${player.cash < i.price && !i.owned ? ' poor' : ''}" data-buy="${i.id}"><span class="buy-name">${i.name}</span><span class="buy-desc">${i.desc}</span><span class="buy-price">${i.owned ? 'OWNED' : '$' + i.price}</span></button>`).join('')}</div>`).join('');
      buyGrid.querySelectorAll('[data-buy]').forEach((b) => {
        b.addEventListener('click', () => {
          const ev = new CustomEvent('buy', { detail: b.getAttribute('data-buy') });
          buyMenu.dispatchEvent(ev);
        });
      });
    },
    onBuy(handler) {
      buyMenu.addEventListener('buy', (e) => handler(e.detail));
    },
    showPlant(progress, label) {
      plantBar.hidden = false;
      plantFill.style.width = `${Math.min(100, progress * 100)}%`;
      plantLabel.textContent = label;
    },
    hidePlant() { plantBar.hidden = true; },
    showScoreboard(title, sub, rows) {
      scoreTitle.textContent = title;
      scoreSub.textContent = sub;
      scoreBody.innerHTML = rows.map((r) => `<tr class="${r.team}"><td>${r.name}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.damage}</td><td>${r.headshots}</td><td>$${r.cash}</td></tr>`).join('');
      scoreboard.hidden = false;
    },
    hideScoreboard() { scoreboard.hidden = true; },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = data.title || text.title;
      copy.textContent = data.copy || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
