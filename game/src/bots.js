// Bots: an FSM per bot (game-ai). Layers: perceive (staggered 8 Hz, cheap to
// expensive: distance, view cone, raycast to head+chest) -> decide (intent) ->
// path (cached waypoint route) -> steer (axis-separated AABB collision, same as
// the player) -> animate (group rotation, fall on death). Fairness: reaction
// delay 0.35-0.6 s, first burst deliberately misses 60%, chase last-known
// position, never the live one after sight is lost. Hysteresis on thresholds;
// a stuck bot repaths after 2 s without progress.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const SPEED = 4.2;
const PERCEIVE_HZ = 8;
const REACT_MIN = 0.35;
const REACT_MAX = 0.6;
const VIEW_DOT = 0.5; // ~60 deg half cone
const HEAR_RADIUS = 25;

const EMBER_NAMES = ['Rook', 'Sable', 'Wick', 'Talan'];
const LANTERN_NAMES = ['Flint', 'Moth', 'Reef', 'Brine', 'Nessa'];

function nameSprite(name, team) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = team === 'ember' ? PALETTE.ember : PALETTE.teal;
  g.fillText(name, 128, 24);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.6, 0.3, 1);
  sp.position.y = 2.05;
  return sp;
}

export function createBots(scene, colliders, rng) {
  const teamMat = {
    ember: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.6, metalness: 0.05 }),
    lantern: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6, metalness: 0.05 }),
  };
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.1 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.24);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.5);
  const flashGeo = new THREE.PlaneGeometry(0.22, 0.22);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });

  const bots = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();

  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + h - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function makeBot(name, team, index) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, teamMat[team]);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.35, 0);
    const gun = new THREE.Mesh(gunGeo, legMat);
    gun.position.set(0.18, 1.05, -0.3);
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0.18, 1.05, -0.62);
    flash.visible = false;
    group.add(torso, head, legL, legR, gun, flash, nameSprite(name, team));
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(group);
    const bot = {
      name, team, group, torso, head, flash, index,
      pos: group.position, yaw: 0, health: 100, alive: true,
      state: 'ROUTE', stateTime: 0, route: [], routeIdx: 0,
      target: null, lastKnown: new THREE.Vector3(), canSee: false,
      reactAt: 0, burstLeft: 0, nextShotAt: 0, firstBurst: true,
      perceiveAt: (index * 0.12) % (1 / PERCEIVE_HZ),
      heardAt: new THREE.Vector3(), heardTime: -99,
      stuckPos: new THREE.Vector3(), stuckTime: 0,
      carrier: false, channel: 0, channelAt: null,
      weapon: index % 3 === 0 ? 'smg' : 'rifle',
      flashLeft: 0, fall: 0,
      kills: 0, deaths: 0, damage: 0, headshots: 0, assists: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  EMBER_NAMES.forEach((n, i) => makeBot(n, 'ember', i));
  LANTERN_NAMES.forEach((n, i) => makeBot(n, 'lantern', i + 4));

  function setState(bot, s, time) {
    if (bot.state === s) return;
    bot.state = s;
    bot.stateTime = time;
    if (s === 'ENGAGE') bot.reactAt = time + REACT_MIN + rng() * (REACT_MAX - REACT_MIN);
    if (s !== 'PLANT' && s !== 'DEFUSE') bot.channel = 0;
  }

  function moveToward(bot, tx, tz, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    const step = Math.min(len, SPEED * dt);
    const nx = bot.pos.x + (dx / len) * step;
    const nz = bot.pos.z + (dz / len) * step;
    if (!overlaps(nx, 0, bot.pos.z, HEIGHT, 0.04)) bot.pos.x = nx;
    if (!overlaps(bot.pos.x, 0, nz, HEIGHT, 0.04)) bot.pos.z = nz;
    bot.yaw = Math.atan2(-dx, -dz);
    return len - step < Math.max(0.6, SPEED * dt);
  }

  function perceive(bot, agents, los, time) {
    if (time < bot.perceiveAt) return;
    bot.perceiveAt = time + 1 / PERCEIVE_HZ;
    let best = null;
    let bestD2 = 40 * 40;
    for (const a of agents) {
      if (!a.alive || a.team === bot.team) continue;
      const dx = a.pos.x - bot.pos.x;
      const dz = a.pos.z - bot.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD2) continue;
      // View cone (cheap) before the raycast (expensive).
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const d = Math.sqrt(d2) || 1;
      if ((dx * fx + dz * fz) / d < VIEW_DOT && d2 > 4) continue;
      // Raycast to chest, then head; either hit sees the target.
      scratch.set(a.pos.x, a.pos.y + 1.1, a.pos.z);
      scratch2.set(bot.pos.x, 1.5, bot.pos.z);
      if (los(scratch2, scratch)) { best = a; bestD2 = d2; continue; }
      scratch.y = a.pos.y + 1.55;
      if (los(scratch2, scratch)) { best = a; bestD2 = d2; }
    }
    if (best) {
      bot.target = best;
      bot.canSee = true;
      bot.lastKnown.set(best.pos.x, 0, best.pos.z);
    } else {
      bot.canSee = false;
    }
  }

  function fireAt(bot, ctx, time) {
    if (time < bot.nextShotAt || !bot.target) return;
    const gap = bot.weapon === 'smg' ? 0.09 : 0.13;
    bot.nextShotAt = time + gap;
    bot.burstLeft -= 1;
    bot.flashLeft = 0.06;
    bot.flash.visible = true;
    // Aim at the chest with disc spread; the first burst after spotting
    // deliberately misses 60% of its shots (fairness).
    const t = bot.target;
    const dist = Math.hypot(t.pos.x - bot.pos.x, t.pos.z - bot.pos.z);
    let spread = 0.03 + dist * 0.0012;
    if (bot.firstBurst && rng() < 0.6) spread *= 4;
    ctx.fire(bot, t, spread);
    if (bot.burstLeft <= 0) {
      bot.nextShotAt = time + 0.55 + rng() * 0.4;
      bot.burstLeft = 3 + Math.floor(rng() * 3);
      bot.firstBurst = false;
    }
  }

  function stepBot(bot, dt, time, agents, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.flashLeft = Math.max(0, bot.flashLeft - dt);
    bot.flash.visible = bot.flashLeft > 0;
    perceive(bot, agents, ctx.los, time);

    // Stuck guard: no progress toward the route in 2 s -> skip a waypoint.
    if (bot.state === 'ROUTE' || bot.state === 'ROTATE') {
      if (Math.hypot(bot.pos.x - bot.stuckPos.x, bot.pos.z - bot.stuckPos.z) < 0.3) {
        if (time - bot.stuckTime > 2) {
          bot.routeIdx = Math.min(bot.routeIdx + 1, bot.route.length - 1);
          bot.stuckPos.copy(bot.pos);
          bot.stuckTime = time;
        }
      } else {
        bot.stuckPos.copy(bot.pos);
        bot.stuckTime = time;
      }
    }

    // Decisions, highest priority first.
    if (bot.canSee && bot.target && bot.target.alive && time - bot.stateTime > 0.3) {
      setState(bot, 'ENGAGE', time);
    } else if (bot.state === 'ENGAGE' && (!bot.canSee || !bot.target || !bot.target.alive)) {
      setState(bot, 'ROUTE', time);
    }
    if (bot.carrier && bot.team === 'ember' && ctx.bombSite && !ctx.bombPlanted) {
      const s = ctx.bombSite;
      if (Math.hypot(bot.pos.x - s.x, bot.pos.z - s.z) < 2) setState(bot, 'PLANT', time);
    }
    if (bot.team === 'lantern' && ctx.bombPlanted && ctx.bombPos) {
      if (Math.hypot(bot.pos.x - ctx.bombPos.x, bot.pos.z - ctx.bombPos.z) < 2) setState(bot, 'DEFUSE', time);
      else if (bot.state !== 'ENGAGE') setState(bot, 'ROTATE', time);
    }

    switch (bot.state) {
      case 'ROUTE':
      case 'ROTATE': {
        const route = bot.state === 'ROTATE' && ctx.bombPos
          ? [{ x: ctx.bombPos.x, z: ctx.bombPos.z }]
          : bot.route;
        const wp = route[Math.min(bot.routeIdx, route.length - 1)];
        if (wp && moveToward(bot, wp.x, wp.z, dt)) bot.routeIdx += 1;
        if (bot.routeIdx >= route.length && bot.state === 'ROUTE') {
          setState(bot, 'HOLD', time);
        }
        break;
      }
      case 'HOLD': {
        // Scan: slow yaw sweep; a heard shot turns the bot toward the sound.
        bot.yaw += Math.sin(time * 0.5 + bot.index) * 0.01;
        if (time - bot.heardTime < 3) {
          bot.yaw = Math.atan2(-(bot.heardAt.x - bot.pos.x), -(bot.heardAt.z - bot.pos.z));
        }
        break;
      }
      case 'ENGAGE': {
        if (bot.target) {
          bot.yaw = Math.atan2(-(bot.target.pos.x - bot.pos.x), -(bot.target.pos.z - bot.pos.z));
          if (time >= bot.reactAt) fireAt(bot, ctx, time);
        }
        break;
      }
      case 'PLANT': {
        bot.channel += dt;
        if (ctx.plant(bot, dt)) setState(bot, 'ROUTE', time);
        break;
      }
      case 'DEFUSE': {
        bot.channel += dt;
        if (ctx.defuse(bot, dt)) setState(bot, 'ROUTE', time);
        break;
      }
      default:
        break;
    }
    bot.group.rotation.y = bot.yaw;
    bot.group.position.set(bot.pos.x, 0, bot.pos.z);
  }

  return {
    bots,
    hitMeshes,
    step(dt, time, agents, ctx) {
      for (const b of bots) stepBot(b, dt, time, agents, ctx);
      // Separation: cheap pairwise push so bots never stack.
      for (let i = 0; i < bots.length; i += 1) {
        const a = bots[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < bots.length; j += 1) {
          const b = bots[j];
          if (!b.alive) continue;
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 0.64 && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (0.8 - d) * 0.5;
            const nx = dx / d;
            const nz = dz / d;
            a.pos.x -= nx * push;
            a.pos.z -= nz * push;
            b.pos.x += nx * push;
            b.pos.z += nz * push;
          }
        }
      }
    },
    hear(pos, time) {
      for (const b of bots) {
        if (!b.alive) continue;
        const d2 = (b.pos.x - pos.x) ** 2 + (b.pos.z - pos.z) ** 2;
        if (d2 < HEAR_RADIUS * HEAR_RADIUS) {
          b.heardAt.set(pos.x, 0, pos.z);
          b.heardTime = time;
        }
      }
    },
    damage(mesh, amount, attacker) {
      const bot = mesh.userData.bot;
      if (!bot || !bot.alive) return null;
      bot.health -= amount;
      if (bot.health > 0) return { killed: false, headshot: mesh.userData.part === 'head' };
      bot.alive = false;
      bot.deaths += 1;
      bot.fall = 0;
      if (attacker) {
        attacker.kills = (attacker.kills || 0) + 1;
        if (mesh.userData.part === 'head') attacker.headshots = (attacker.headshots || 0) + 1;
      }
      return { killed: true, headshot: mesh.userData.part === 'head', bot };
    },
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    reset(spawns) {
      for (const b of bots) {
        b.health = 100;
        b.alive = true;
        b.fall = 0;
        b.channel = 0;
        b.carrier = false;
        b.target = null;
        b.canSee = false;
        b.routeIdx = 0;
        b.state = 'ROUTE';
        b.stateTime = 0;
        b.group.rotation.set(0, 0, 0);
        const s = spawns[b.team][b.index % spawns[b.team].length];
        b.pos.set(s.x, 0, s.z);
        b.yaw = b.team === 'ember' ? Math.PI : 0;
        b.group.position.copy(b.pos);
        b.group.rotation.y = b.yaw;
      }
    },
    aimPoint(i) {
      const b = bots[i % bots.length];
      return new THREE.Vector3(b.pos.x, 1.1, b.pos.z);
    },
  };
}
