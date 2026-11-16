// Night Bazaar: boot and the one loop. A fixed 60 Hz simulation feeds a render
// at the display's rate; state lives in plain objects, meshes are a view.
// ?shot=combat|buy|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, MAP, createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE, ARMOUR, falloff } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRounds, PLANT_SECONDS, DEFUSE_SECONDS } from './rounds.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);
Object.assign(window, { renderer, scene });

const world = createWorld(scene);
const bots = createBots(scene, world.colliders, random);
const weapons = createWeapons(camera);
const effects = createEffects(scene, camera);
const audio = createAudio();
const hud = createHud();
const rounds = createRounds();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const losRay = new THREE.Raycaster();
losRay.far = 80;

const shootables = world.shootables.concat(bots.hitMeshes);
const body = player.state;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const me = {
  kind: 'player', name: 'You', team: 'ember', alive: true,
  pos: body.position,
  health: 100, armour: 0, cash: 800, owned: new Set(['pistol']), grenades: 0,
  kills: 0, deaths: 0, damage: 0, headshots: 0, carrier: true,
  ammo: { pistol: { mag: 12, reserve: 36 } },
};
const agents = [me, ...bots.bots.map((b) => ({ kind: 'bot', ref: b, pos: b.pos, get alive() { return b.alive; }, team: b.team }))];
const seenAt = new Map(); // bot -> last time it was seen/firing (minimap)
let elapsed = 0;
let frozen = false;
let started = false;
let buyOpen = false;
let accumulator = 0;
let lastTime = performance.now();
let zoomed = false;
const grenades = [];
let carrierSite = 'A';

const EMBER_SPAWNS = [[0, 15], [-3, 15], [3, 15], [-1.5, 16.5], [1.5, 16.5]];
const LANTERN_SPAWNS = [[0, -15], [-3, -15], [3, -15], [-1.5, -16.5], [1.5, -16.5]];

function calloutAt(x, z) {
  let best = MAP.callouts[0];
  let bestD = Infinity;
  for (const c of MAP.callouts) {
    const d = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.name;
}

function los(from, to) {
  tmpV.subVectors(to, from);
  const dist = tmpV.length();
  if (dist < 0.01) return true;
  tmpV.normalize();
  losRay.set(from, tmpV);
  losRay.far = dist;
  const hit = losRay.intersectObjects(world.shootables, false)[0];
  return !hit || hit.distance >= dist - 0.6;
}

function muzzleWorld(out) {
  camera.getWorldDirection(tmpV);
  out.copy(camera.position).addScaledVector(tmpV, 0.6);
  tmpV2.set(1, 0, 0).applyQuaternion(camera.quaternion);
  out.addScaledVector(tmpV2, 0.24);
  tmpV2.set(0, -1, 0).applyQuaternion(camera.quaternion);
  out.addScaledVector(tmpV2, 0.16);
  return out;
}

function discSpread(spread) {
  const a = random() * Math.PI * 2;
  const r = Math.sqrt(random()) * spread;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function applyDamageToPlayer(amount, attacker) {
  if (!me.alive) return false;
  const absorbed = Math.min(me.armour, amount * 0.5);
  me.armour -= absorbed;
  me.health -= (amount - absorbed);
  hud.damageFlash();
  audio.hurt();
  effects.shake(0.25);
  if (me.health <= 0) {
    me.health = 0;
    me.alive = false;
    me.deaths += 1;
    dropBomb();
    hud.toast('You are down — your team fights on', 3000);
    audio.roundLose();
    return true;
  }
  return false;
}

function damageBot(mesh, amount, attacker) {
  const res = bots.damage(mesh, amount, attacker);
  if (!res) return null;
  if (attacker) attacker.damage = (attacker.damage || 0) + amount;
  return res;
}

function onKill(killer, victim, weaponName, headshot) {
  const killerName = killer.kind === 'player' ? 'You' : killer.name;
  const victimName = victim.kind === 'player' ? 'You' : victim.name;
  hud.killfeed(killerName, weaponName, victimName, headshot, killer.team);
  if (killer.kind === 'player') {
    rounds.awardKill(me);
    audio.kill();
    effects.hitStop(0.06);
    effects.shake(0.35);
  }
  if (victim.kind === 'player') return;
  if (killer.kind === 'bot' && killer.ref) {
    hud.radio(`${killer.name} dropped ${victimName} at ${calloutAt(victim.pos.x, victim.pos.z)}`, killer.team);
  }
}

function shootPlayer() {
  const d = weapons.def();
  const spread = weapons.spread(player.groundSpeed());
  const off = discSpread(spread);
  camera.getWorldDirection(direction);
  direction.x += off.x;
  direction.y += off.y;
  direction.normalize();
  muzzleWorld(muzzle);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hits = raycaster.intersectObjects(shootables, false);
  const hit = hits.find((h) => !h.object.userData.bot || h.object.userData.bot.alive);
  const end = hit ? hit.point : tmpV.copy(camera.position).addScaledVector(direction, 80);
  effects.spawnTracer(muzzle, end);
  weapons.pullTrigger();
  audio.shot(weapons.state.id);
  player.recoil(d.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * d.recoil * 0.4);
  bots.hear(camera.position, elapsed);
  if (!hit) return;
  hitPoint.copy(hit.point);
  if (hit.object.userData.bot) {
    const dist = hit.distance;
    const head = hit.object.userData.part === 'head';
    const dmg = Math.round(d.damage * (head ? d.head : 1) * falloff(d, dist));
    const res = damageBot(hit.object, dmg, me);
    effects.spawnBurst(hitPoint, '#ff3b2a', 10, 3);
    hud.hitMarker(res && res.killed, head, shot ? 4000 : 90);
    audio.hit();
    if (res && res.killed) onKill(me, res.bot, d.name, head);
    return;
  }
  effects.spawnBurst(hitPoint, '#c9b896', 6, 2);
}

function botFire(bot, target, spread) {
  // Raycast from the bot's muzzle toward the target's chest with disc spread.
  tmpV.set(bot.pos.x, 1.45, bot.pos.z);
  const aim = tmpV2.set(target.pos.x, target.pos.y + 1.1, target.pos.z);
  const dir = aim.sub(tmpV).normalize();
  const off = discSpread(spread);
  dir.x += off.x;
  dir.y += off.y;
  dir.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(tmpV, dir);
  // Skip the shooter's own head/torso: the muzzle sits inside its head box.
  // Dead bots stop blocking shots.
  const hits = raycaster.intersectObjects(shootables, false);
  const hit = hits.find((h) => h.object.userData.bot !== bot && (!h.object.userData.bot || h.object.userData.bot.alive));
  const end = hit ? hit.point : tmpV.clone().addScaledVector(dir, 80);
  effects.spawnTracer(tmpV, end);
  seenAt.set(bot, elapsed);
  audio.enemyShot();
  if (!hit) return;
  const victim = hit.object.userData.bot;
  if (victim && victim !== bot) {
    const d = WEAPONS[bot.weapon];
    const head = hit.object.userData.part === 'head';
    const dmg = Math.round(d.damage * (head ? d.head : 1) * falloff(d, hit.distance));
    if (victim.team === bot.team) {
      // Teammate crossed the line: the shot stops there, no damage.
      effects.spawnBurst(hit.point, '#c9b896', 5, 2);
      return;
    }
    const res = damageBot(hit.object, dmg, bot);
    effects.spawnBurst(hit.point, '#ff3b2a', 8, 3);
    if (res && res.killed) onKill(bot, res.bot, d.name, head);
    return;
  }
  if (hit.distance < 80 && me.alive) {
    // The player has no mesh; test the ray against the player's capsule.
    const px = body.position.x;
    const pz = body.position.z;
    const dx = px - tmpV.x;
    const dz = pz - tmpV.z;
    const along = dx * dir.x + dz * dir.z;
    if (along > 0 && along < hit.distance + 0.5) {
      const perp = Math.hypot(dx - dir.x * along, dz - dir.z * along);
      if (perp < 0.45) {
        const d = WEAPONS[bot.weapon];
        const dmg = Math.round(d.damage * falloff(d, along));
        const died = applyDamageToPlayer(dmg, bot);
        effects.spawnBurst(new THREE.Vector3(px, body.position.y + 1.1, pz), '#ff3b2a', 8, 3);
        if (died) onKill(bot, me, d.name, false);
      }
    }
  }
}

function throwGrenade() {
  if (me.grenades <= 0 || !me.alive) return;
  me.grenades -= 1;
  camera.getWorldDirection(direction);
  grenades.push({
    pos: muzzleWorld(new THREE.Vector3()),
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: 2.2,
  });
  audio.shot('smg');
}

function explodeGrenade(g) {
  effects.explode(g.pos);
  audio.explosion();
  effects.shake(0.6);
  for (const a of agents) {
    if (!a.alive) continue;
    const dist = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
    if (dist > 6) continue;
    const dmg = Math.round(120 - (dist / 6) * 100);
    if (a.kind === 'player') applyDamageToPlayer(Math.round(dmg * 0.5), null);
    else {
      const res = bots.damage(a.ref.torso, dmg, me);
      if (res && res.killed) onKill(me, a.ref, 'Ember Charge', false);
    }
  }
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 12 * dt;
    g.pos.addScaledVector(g.vel, dt);
    let boom = g.fuse <= 0 || g.pos.y <= 0.05;
    if (!boom) {
      for (const c of world.colliders) {
        if (c.containsPoint(g.pos)) { boom = true; break; }
      }
    }
    if (boom) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function dropBomb() {
  if (!me.carrier) return;
  me.carrier = false;
  let best = null;
  let bestD = Infinity;
  for (const b of bots.bots) {
    if (!b.alive || b.team !== 'ember') continue;
    const d = (b.pos.x - body.position.x) ** 2 + (b.pos.z - body.position.z) ** 2;
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) {
    best.carrier = true;
    best.route = (carrierSite === 'A' ? MAP.routes.toA : MAP.routes.toB).map(([x, z]) => ({ x, z }));
    best.routeIdx = 0;
    hud.radio(`${best.name} picked up the charge`, 'ember');
  }
}

function nearestSite(x, z) {
  const da = (x - MAP.sites.A.x) ** 2 + (z - MAP.sites.A.z) ** 2;
  const db = (x - MAP.sites.B.x) ** 2 + (z - MAP.sites.B.z) ** 2;
  return da < db ? 'A' : 'B';
}

function startRound() {
  bots.reset({ ember: EMBER_SPAWNS, lantern: LANTERN_SPAWNS });
  body.position.set(0, 0, 15);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  me.health = 100;
  me.alive = true;
  me.carrier = true;
  me.grenades = me.owned.has('grenade') ? 1 : 0;
  carrierSite = random() < 0.5 ? 'A' : 'B';
  weapons.equip('pistol');
  me.ammo = { pistol: { mag: 12, reserve: 36 } };
  weapons.state.mag = 12;
  weapons.state.reserve = 36;
  // Assign routes: attackers push sites, defenders hold them.
  const ember = bots.bots.filter((b) => b.team === 'ember');
  const lantern = bots.bots.filter((b) => b.team === 'lantern');
  const emberRoutes = [MAP.routes.toA, MAP.routes.toB, MAP.routes.toMid, MAP.routes.toA];
  ember.forEach((b, i) => {
    b.route = emberRoutes[i].map(([x, z]) => ({ x, z }));
    b.routeIdx = 0;
  });
  const lanternRoutes = [MAP.routes.defA, MAP.routes.defB, MAP.routes.holdMid, MAP.routes.defA, MAP.routes.defB];
  lantern.forEach((b, i) => {
    b.route = lanternRoutes[i].map(([x, z]) => ({ x, z }));
    b.routeIdx = 0;
  });
  rounds.startRound();
  hud.hideScoreboard();
  hud.toast(`Round ${rounds.state.round} — plant at ${MAP.sites[carrierSite].name}`, 3000);
  hud.radio(`Going ${carrierSite} — ${MAP.sites[carrierSite].name}`, 'ember');
}

function scoreboardRows() {
  const rows = [];
  const emberRows = [{ name: 'You', team: 'ember', kills: me.kills, deaths: me.deaths, damage: Math.round(me.damage), headshots: me.headshots, cash: me.cash }];
  for (const b of bots.bots) {
    const row = { name: b.name, team: b.team, kills: b.kills, deaths: b.deaths, damage: Math.round(b.damage), headshots: b.headshots, cash: 800 + b.kills * 300 + rounds.state.score[b.team] * 1000 };
    if (b.team === 'ember') emberRows.push(row);
    else rows.push(row);
  }
  return [...emberRows, ...rows];
}

function handleRoundEvent(ev) {
  if (!ev) return;
  if (ev.roundEnd) {
    const winner = ev.winner;
    rounds.awardRound(me, winner);
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    hud.toast(ev.reason, 4000);
    hud.showScoreboard(
      winner === 'ember' ? 'EMBER takes the round' : 'LANTERN takes the round',
      `${ev.reason} — Round ${rounds.state.round} · EMBER ${rounds.state.score.ember} — LANTERN ${rounds.state.score.lantern}`,
      scoreboardRows(),
    );
  } else if (ev.nextRound) {
    startRound();
  } else if (ev.matchEnd) {
    const w = ev.winner;
    hud.showOverlay('end', {
      title: w === 'ember' ? 'VICTORY — EMBER takes the match' : 'DEFEAT — LANTERN takes the match',
      copy: `Final score EMBER ${rounds.state.score.ember} — LANTERN ${rounds.state.score.lantern}. Press Enter or click Play again for a new match.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
    if (w === 'ember') audio.roundWin();
    else audio.roundLose();
  }
}

function buy(id) {
  if (rounds.state.phase !== 'BUY') { hud.toast('The buy phase is over', 1500); return; }
  if (id === 'grenade') {
    if (me.grenades > 0) { hud.toast('Already carrying a charge', 1200); return; }
    if (me.cash < GRENADE.price) { hud.toast('Not enough cash', 1200); return; }
    me.cash -= GRENADE.price;
    me.grenades = 1;
    me.owned.add('grenade');
    audio.buy();
    hud.showBuy(true, me, rounds.state.phaseT);
    return;
  }
  if (id === 'armour') {
    if (me.armour > 0) { hud.toast('Already wearing a vest', 1200); return; }
    if (me.cash < ARMOUR.price) { hud.toast('Not enough cash', 1200); return; }
    me.cash -= ARMOUR.price;
    me.armour = 100;
    audio.buy();
    hud.showBuy(true, me, rounds.state.phaseT);
    return;
  }
  const w = WEAPONS[id];
  if (!w) return;
  if (me.owned.has(id)) {
    equipWeapon(id);
    hud.showBuy(true, me, rounds.state.phaseT);
    return;
  }
  if (me.cash < w.price) { hud.toast('Not enough cash', 1200); return; }
  me.cash -= w.price;
  me.owned.add(id);
  me.ammo[id] = { mag: w.mag, reserve: w.reserve };
  equipWeapon(id);
  audio.buy();
  hud.showBuy(true, me, rounds.state.phaseT);
}

function equipWeapon(id) {
  const prev = weapons.state.id;
  me.ammo[prev] = { mag: weapons.state.mag, reserve: weapons.state.reserve };
  weapons.equip(id);
  const saved = me.ammo[id];
  if (saved) {
    weapons.state.mag = saved.mag;
    weapons.state.reserve = saved.reserve;
  }
  zoomed = false;
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function step(dt, realDt) {
  elapsed += dt;
  const ev = rounds.tick(dt);
  handleRoundEvent(ev);
  if (rounds.state.phase === 'LIVE' && rounds.state.phaseT <= 0) {
    handleRoundEvent(rounds.checkTimer());
  }

  // Player movement + weapon.
  if (me.alive && !rounds.state.matchOver) player.step(dt, input.state.keys);
  weapons.step(dt, elapsed);

  // Plant / defuse channel (player holds E).
  const planting = me.alive && input.state.keys.has('KeyE') && !rounds.state.bomb.planted && rounds.state.phase === 'LIVE';
  const defusing = me.alive && input.state.keys.has('KeyE') && rounds.state.bomb.planted && rounds.state.phase === 'LIVE';
  if (planting) {
    const site = nearestSite(body.position.x, body.position.z);
    const s = MAP.sites[site];
    const d = Math.hypot(body.position.x - s.x, body.position.z - s.z);
    if (d < 3.5) {
      const done = rounds.plantProgress('player', site, dt);
      hud.showPlant(rounds.state.plant.progress / PLANT_SECONDS, `Arming the charge at ${s.name} — hold E`);
      if (done) {
        rounds.plant(site, { x: s.x, z: s.z });
        rounds.awardPlant(me);
        effects.beacon.place({ x: s.x, z: s.z });
        audio.plantBeep();
        hud.toast(`Charge planted at ${s.name} — 40 seconds`, 3000);
        hud.radio(`Charge planted at ${s.name}`, 'ember');
        hud.hidePlant();
      }
    } else {
      hud.hidePlant();
    }
  } else if (defusing) {
    const b = rounds.state.bomb.pos;
    const d = Math.hypot(body.position.x - b.x, body.position.z - b.z);
    if (d < 3) {
      const done = rounds.defuseProgress('player', dt);
      hud.showPlant(rounds.state.defuse.progress / DEFUSE_SECONDS, 'Defusing the charge — hold E');
      if (done) {
        const ev2 = rounds.defused();
        rounds.awardDefuse(me);
        effects.beacon.remove();
        audio.defuseBeep();
        handleRoundEvent(ev2);
        hud.hidePlant();
      }
    } else {
      hud.hidePlant();
    }
  } else {
    hud.hidePlant();
  }

  // Bots.
  const ctx = {
    los,
    fire: botFire,
    plant(bot, pdt) {
      const s = MAP.sites[carrierSite];
      const done = rounds.plantProgress(bot, carrierSite, pdt);
      if (done) {
        rounds.plant(carrierSite, { x: s.x, z: s.z });
        effects.beacon.place({ x: s.x, z: s.z });
        hud.toast(`Charge planted at ${s.name} — 40 seconds`, 3000);
        hud.radio(`Charge planted at ${s.name}`, 'ember');
      }
      return done;
    },
    defuse(bot, pdt) {
      const done = rounds.defuseProgress(bot, pdt);
      if (done) {
        const ev2 = rounds.defused();
        effects.beacon.remove();
        handleRoundEvent(ev2);
      }
      return done;
    },
    bombSite: MAP.sites[carrierSite],
    bombPlanted: rounds.state.bomb.planted,
    bombPos: rounds.state.bomb.pos,
  };
  if (!rounds.state.matchOver) bots.step(dt, elapsed, agents, ctx);
  updateGrenades(dt);

  // Elimination win check after any death this step.
  const alive = {
    ember: bots.aliveCount('ember') + (me.alive ? 1 : 0),
    lantern: bots.aliveCount('lantern'),
  };
  handleRoundEvent(rounds.checkElimination(alive));

  effects.step(dt, realDt, elapsed);
}

function updateHud() {
  const d = weapons.def();
  const slots = [me.owned.has('rifle') || me.owned.has('smg') || me.owned.has('shotgun') || me.owned.has('sniper'), me.owned.has('pistol'), me.grenades > 0];
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, d.name, me.grenades, slots);
  hud.setVitals(me.health, me.armour, me.cash);
  hud.setScore(rounds.state.score.ember, rounds.state.score.lantern, rounds.state.round, rounds.state.phaseT, rounds.state.phase);
  hud.setSpread(4 + weapons.spread(player.groundSpeed()) * 400);
  hud.drawMinimap({ wallRects: world.wallRects, sites: MAP.sites, callouts: MAP.callouts }, agents, body.yaw, (a) => (a.kind === 'bot' ? elapsed - (seenAt.get(a.ref) || -99) : 0) < 3 ? 1 : 0);
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  const scale = effects.consumeHitStop(realDt);
  const dt = realDt * scale;

  if (!shot) {
    const look = input.takeLook();
    const sens = zoomed ? 0.42 : 1;
    player.look(look.x * sens, look.y * sens);
    // ADS: right mouse with the sniper.
    const wantZoom = input.state.aiming && weapons.state.id === 'sniper';
    if (wantZoom !== zoomed) {
      zoomed = wantZoom;
      camera.fov = zoomed ? 31 : 74;
      camera.updateProjectionMatrix();
    }
    // Firing on the scheduled clock.
    if (me.alive && input.state.firing && !buyOpen && rounds.state.phase !== 'END') {
      const n = weapons.dueShots(now / 1000, true);
      for (let i = 0; i < n; i += 1) shootPlayer();
    }
    if (input.state.keys.has('KeyR')) weapons.reload();
    if (input.wasPressed('KeyB') && rounds.state.phase === 'BUY' && me.alive) {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen, me, rounds.state.phaseT);
      if (buyOpen) input.exitLock();
      else input.requestLock();
    }
    if (input.wasPressed('KeyG')) throwGrenade();
    if (input.wasPressed('Digit1')) {
      const prim = ['rifle', 'smg', 'shotgun', 'sniper'].find((id) => me.owned.has(id));
      if (prim) equipWeapon(prim);
    }
    if (input.wasPressed('Digit2') && me.owned.has('pistol')) equipWeapon('pistol');
    if (input.wasPressed('Digit3')) throwGrenade();
    if (input.wasPressed('Enter') && rounds.state.matchOver) {
      rounds.startMatch();
      startRound();
      hud.hideOverlay();
      input.requestLock();
    }
    if (input.state.keys.has('Tab')) {
      hud.showScoreboard(
        `Round ${rounds.state.round} — EMBER ${rounds.state.score.ember} · LANTERN ${rounds.state.score.lantern}`,
        'Hold Tab to keep the scoreboard open',
        scoreboardRows(),
      );
    } else if (rounds.state.phase !== 'END') {
      hud.hideScoreboard();
    }
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP, realDt);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
  updateHud();
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP, FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  rounds.startMatch();
  startRound();
  // Combat and plant shots are mid-round, not in the buy phase.
  if (name === 'combat' || name === 'plant') {
    rounds.state.phase = 'LIVE';
    rounds.state.phaseT = 100;
  }
  // Seed the feed and radio so the shots read as a live match.
  hud.killfeed('Rook', 'Juniper R7', 'Flint', false, 'ember');
  hud.killfeed('You', 'Juniper R7', 'Moth', true, 'ember');
  hud.radio('Contact at TOWER', 'ember');
  hud.radio('Rotating to B', 'lantern');
  if (name === 'combat') {
    // Player mid-lane, pulled back so the lantern tower reads in frame.
    // TWO LANTERN bots visible: Flint east of the tower (the one the player
    // is shooting, mid-burst, red-flashing, tracer + muzzle glow still in
    // the air when the frame freezes) and Moth west of it, facing the player
    // with its own muzzle flash lit.
    body.position.set(0, 0, 11);
    body.yaw = 0;
    body.pitch = 0;
    const enemy = bots.bots.find((b) => b.team === 'lantern');
    enemy.pos.set(3.5, 0, 5);
    enemy.group.position.copy(enemy.pos);
    enemy.state = 'HOLD';
    enemy.yaw = Math.atan2(3.5, -6); // face the player
    enemy.group.rotation.y = enemy.yaw;
    const second = bots.bots.find((b) => b.team === 'lantern' && b.name === 'Moth');
    second.pos.set(-3, 0, 4.5);
    second.group.position.copy(second.pos);
    second.state = 'HOLD';
    second.yaw = Math.atan2(-3, -6.5); // face the player
    second.group.rotation.y = second.yaw;
    settle(20);
    weapons.equip('rifle');
    me.ammo.rifle = { mag: 30, reserve: 90 };
    weapons.state.mag = 30;
    weapons.state.reserve = 90;
    for (let r = 0; r < 2; r += 1) {
      aimAt(new THREE.Vector3(enemy.pos.x, 1.1, enemy.pos.z));
      shootPlayer();
      if (r < 1) settle(8);
    }
    settle(1);
    // Moth's muzzle flash is lit last: step() would have extinguished it
    // (flashLeft decays per step), and paintTwiceThenReady never steps, so
    // it stays lit in the frozen frame.
    second.flashLeft = 0.06;
    second.flash.visible = true;
    // Frame the final shot on the tower between the two bots, not on Flint
    // alone: the landmark, the shooter and the second bot all in view.
    aimAt(new THREE.Vector3(0.5, 2.0, 1.5));
  } else if (name === 'buy') {
    body.position.set(0, 0, 15);
    body.yaw = 0;
    body.pitch = 0;
    me.cash = 5200;
    settle(20);
    hud.showBuy(true, me, 12);
    aimAt(new THREE.Vector3(0, 2, 0));
  } else if (name === 'plant') {
    body.position.set(-16, 0, -5);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(-19, 0.6, -8));
    rounds.state.plant = { by: 'player', at: 'A', progress: 1.5 };
    effects.beacon.place({ x: -19, z: -8 });
    const enemy = bots.bots.find((b) => b.team === 'lantern' && b.name === 'Reef');
    enemy.pos.set(-20, 0, -9.5);
    enemy.group.position.copy(enemy.pos);
    enemy.yaw = Math.atan2(-4, -4.5); // face the site / player
    enemy.group.rotation.y = enemy.yaw;
    settle(1);
    // Show the bar last: the sim hides it every step while E is not held.
    hud.showPlant(0.5, 'Arming the charge at SPICE ROW — hold E');
  } else if (name === 'end') {
    rounds.state.score = { ember: 3, lantern: 2 };
    rounds.state.round = 6;
    rounds.state.phase = 'END';
    rounds.state.phaseT = 4;
    me.kills = 7; me.deaths = 2; me.damage = 840; me.headshots = 3;
    bots.bots[0].kills = 4; bots.bots[0].deaths = 1; bots.bots[0].damage = 420; bots.bots[0].headshots = 1;
    bots.bots[4].kills = 5; bots.bots[4].deaths = 3; bots.bots[4].damage = 610; bots.bots[4].headshots = 2;
    body.position.set(0, 0, 12);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 3, 0));
    hud.showScoreboard(
      'EMBER takes the round',
      'All defenders eliminated — Round 6 · EMBER 3 — LANTERN 2',
      scoreboardRows(),
    );
  }
  syncCamera();
  updateHud();
  hud.hideToast(); // staged shots stay clean — no round toast ghosting through panels
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.matchOver) {
    rounds.startMatch();
    startRound();
  }
  input.requestLock();
});
hud.onBuy(buy);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    buyOpen = false;
    hud.showBuy(false, me, 0);
    hud.hideOverlay();
  } else if (!rounds.state.matchOver) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

syncCamera();
rounds.startMatch();
startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
