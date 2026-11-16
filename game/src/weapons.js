// Weapons as data (fps-shooter Pattern 2): damage by range, head multiplier 3x,
// fire rate, magazine, reload, spread, recoil. TTK vs 100 HP, all body shots:
// Moth P4 0.45 s (4 shots), Wasp-9 0.34 s (5), Juniper R7 0.20 s (3),
// Boar 12 0.85 s (2 close pumps), Longshadow L9 0.00 s (1 body shot at 88? no:
// 2 shots, 1.30 s — the headshot is the one-shot kill). Fire timing runs on a
// scheduled clock (Pattern 1): shots are scheduled, never reset to "now".
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'Moth P4', slot: 1, price: 300, cat: 'Sidearms', damage: 26, head: 3, pellets: 1, mag: 12, reserve: 36, gap: 0.15, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, recoil: 0.012, falloffFrom: 15, falloffTo: 40, falloffFloor: 0.5, zoom: 0 },
  smg: { name: 'Wasp-9', slot: 1, price: 1500, cat: 'Close range', damage: 22, head: 3, pellets: 1, mag: 32, reserve: 96, gap: 0.075, auto: true, reload: 1.8, spreadStill: 0.008, spreadMove: 0.04, recoil: 0.008, falloffFrom: 12, falloffTo: 30, falloffFloor: 0.5, zoom: 0 },
  rifle: { name: 'Juniper R7', slot: 2, price: 2700, cat: 'Rifles', damage: 34, head: 3, pellets: 1, mag: 30, reserve: 90, gap: 0.1, auto: true, reload: 1.9, spreadStill: 0.002, spreadMove: 0.028, recoil: 0.011, falloffFrom: 20, falloffTo: 50, falloffFloor: 0.6, zoom: 0 },
  shotgun: { name: 'Boar 12', slot: 2, price: 1800, cat: 'Close range', damage: 12, head: 2, pellets: 8, mag: 6, reserve: 24, gap: 0.85, auto: false, reload: 2.6, spreadStill: 0.05, spreadMove: 0.07, recoil: 0.03, falloffFrom: 8, falloffTo: 18, falloffFloor: 0.4, zoom: 0 },
  sniper: { name: 'Longshadow L9', slot: 2, price: 4750, cat: 'Rifles', damage: 88, head: 3, pellets: 1, mag: 5, reserve: 15, gap: 1.3, auto: false, reload: 3.2, spreadStill: 0.0005, spreadMove: 0.06, recoil: 0.05, falloffFrom: 30, falloffTo: 60, falloffFloor: 0.7, zoom: 2.4 },
};
export const GRENADE = { name: 'Ember Charge', price: 300, cat: 'Grenades', count: 1 };
export const ARMOUR = { name: 'Woven Vest', price: 650, cat: 'Gear' };

export function falloff(def, dist) {
  if (dist <= def.falloffFrom) return 1;
  const t = Math.min(1, (dist - def.falloffFrom) / (def.falloffTo - def.falloffFrom));
  return 1 - (1 - def.falloffFloor) * t;
}

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e2a33'), roughness: 0.45, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.brick), roughness: 0.8, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 });

  function buildModel(id) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    if (id === 'pistol') {
      add(new THREE.BoxGeometry(0.07, 0.09, 0.26), body, 0, 0, -0.1);
      add(new THREE.BoxGeometry(0.06, 0.12, 0.07), grip, 0, -0.09, 0.05);
      add(new THREE.BoxGeometry(0.02, 0.03, 0.05), accent, 0, 0.055, -0.2);
    } else if (id === 'smg') {
      add(new THREE.BoxGeometry(0.08, 0.09, 0.4), body, 0, 0, -0.12);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.3), grip, 0, 0.02, -0.4);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.08), grip, 0, -0.1, 0.02);
      add(new THREE.BoxGeometry(0.07, 0.06, 0.2), wood, 0, -0.02, 0.28);
    } else if (id === 'shotgun') {
      add(new THREE.BoxGeometry(0.09, 0.09, 0.46), body, 0, 0, -0.12);
      add(new THREE.BoxGeometry(0.07, 0.07, 0.34), wood, 0, -0.03, -0.34);
      add(new THREE.BoxGeometry(0.07, 0.1, 0.24), wood, 0, -0.03, 0.3);
    } else if (id === 'sniper') {
      add(new THREE.BoxGeometry(0.08, 0.09, 0.5), body, 0, 0, -0.14);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), accent, 0, 0.07, -0.12).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.05, 0.05, 0.36), grip, 0, 0.03, -0.42);
      add(new THREE.BoxGeometry(0.07, 0.09, 0.22), wood, 0, -0.02, 0.3);
    } else {
      add(new THREE.BoxGeometry(0.09, 0.1, 0.42), body, 0, 0, -0.1);
      add(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip, 0, 0.025, -0.38);
      add(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip, 0, -0.02, 0.3);
    }
    g.position.set(0.26, -0.26, -0.5);
    g.scale.setScalar(0.8);
    return g;
  }

  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = buildModel(id);
    models[id].visible = false;
    camera.add(models[id]);
  }

  // Muzzle flash: a soft radial glow, not a flat card.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.4, 'rgba(255, 179, 71, 0.9)');
  grad.addColorStop(1, 'rgba(255, 179, 71, 0)');
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, 64, 64);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.24, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.26, -0.22, -0.6);
  camera.add(flashLight);

  const state = {
    id: 'pistol', mag: 12, reserve: 36, nextShotAt: 0, reloadLeft: 0,
    flash: 0, kick: 0, shotsFired: 0, zoomed: false,
  };

  function def() { return WEAPONS[state.id]; }

  function step(dt, now) {
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.id];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const d = def();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    equip(id) {
      if (!WEAPONS[id] || id === state.id) return false;
      models[state.id].visible = false;
      state.id = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.reloadLeft = 0;
      state.nextShotAt = 0;
      state.zoomed = false;
      models[id].visible = true;
      return true;
    },
    show() { models[state.id].visible = true; },
    hide() { models[state.id].visible = false; },
    // Scheduled-clock fire (Pattern 1): returns how many shots are due now.
    dueShots(now, held) {
      const d = def();
      if (!held || state.mag <= 0 || state.reloadLeft > 0) return 0;
      if (state.nextShotAt < now - d.gap) state.nextShotAt = now;
      let n = 0;
      while (state.nextShotAt <= now && state.mag > 0 && n < 3) {
        state.nextShotAt += d.gap;
        state.mag -= 1;
        state.shotsFired += 1;
        n += 1;
        if (!d.auto) break;
      }
      return n;
    },
    pullTrigger() {
      state.flash = 0.06;
      state.kick = 0.055;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      return d.spreadStill + moving * d.spreadMove;
    },
    refill() {
      state.mag = def().mag;
      state.reserve = def().reserve;
      state.nextShotAt = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
