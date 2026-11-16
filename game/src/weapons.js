// Weapons as data (fps-shooter Pattern 2): damage by range, head multiplier 3x,
// fire rate, magazine, reload, spread, recoil. TTK vs 100 HP, all body shots:
// Moth P4 0.45 s (4 shots), Wasp-9 0.34 s (5), Juniper R7 0.20 s (3),
// Boar 12 0.85 s (2 close pumps), Longshadow L9 0.00 s (1 body shot at 88? no:
// 2 shots, 1.30 s — the headshot is the one-shot kill). Fire timing runs on a
// scheduled clock (Pattern 1): shots are scheduled, never reset to "now".
//
// The viewmodels are built as real guns, not slabs: each has a receiver,
// barrel, magazine, stock, grip, sights and the small parts that sell it
// (charging handle, ejection port, trigger guard, muzzle device). Parts are
// merged boxes/cylinders — the realism comes from correct proportions and
// parts, not polygon count. Materials differ by part: gunmetal is slightly
// glossy, polymer is matte, wood is warm; never flat black.
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
  // Gun materials: gunmetal (slightly glossy), polymer (matte), wood (warm),
  // plus a near-black for recesses. Slightly different tones per part so the
  // shape reads in the dusk light instead of one flat black slab.
  const gunmetal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d4d55'), roughness: 0.35, metalness: 0.7 });
  const gunmetalDark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e2e35'), roughness: 0.4, metalness: 0.65 });
  const polymer = new THREE.MeshStandardMaterial({ color: new THREE.Color('#38382f'), roughness: 0.85, metalness: 0.05 });
  const polymerTan = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a4030'), roughness: 0.85, metalness: 0.05 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.brick), roughness: 0.75, metalness: 0.05 });
  const recess = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0e0d10'), roughness: 0.6, metalness: 0.3 });

  // A part is a mesh in the gun's local space: the gun points down -Z, the
  // trigger sits near the origin, the muzzle is the most negative z.
  function buildModel(id) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg);
    // A trigger guard reads as a gun at a glance: a small loop under the receiver.
    const guard = (x, y, z) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 6, 12), gunmetalDark);
      t.position.set(x, y, z);
      t.rotation.y = Math.PI / 2;
      g.add(t);
    };
    let muzzleZ = -0.5; // local z of the barrel tip; the flash sits here.
    if (id === 'pistol') {
      // Moth P4: a compact service pistol. Slide, frame, grip, sights.
      add(box(0.055, 0.05, 0.24), gunmetal, 0, 0.01, -0.08); // slide
      add(box(0.05, 0.045, 0.2), gunmetalDark, 0, -0.035, -0.06); // frame
      add(box(0.048, 0.13, 0.06), polymer, 0, -0.1, 0.04, 0.25); // grip, raked back
      add(box(0.012, 0.02, 0.012), recess, 0, 0.045, -0.18); // front sight
      add(box(0.03, 0.018, 0.015), recess, 0, 0.045, 0.02); // rear sight
      add(cyl(0.014, 0.03), gunmetalDark, 0, 0.01, -0.2, Math.PI / 2); // muzzle
      guard(0, -0.055, -0.03);
      muzzleZ = -0.21;
    } else if (id === 'smg') {
      // Wasp-9: short barrel, long straight magazine, vertical foregrip,
      // a thin folding stock.
      add(box(0.07, 0.085, 0.3), gunmetal, 0, 0, -0.06); // receiver
      add(cyl(0.018, 0.22), gunmetalDark, 0, 0.01, -0.3, Math.PI / 2); // barrel
      add(box(0.06, 0.06, 0.2), polymer, 0, -0.005, -0.26); // handguard
      add(box(0.045, 0.2, 0.055), polymer, 0, -0.13, -0.1); // long straight mag
      add(box(0.05, 0.1, 0.06), polymer, 0, -0.08, -0.3); // vertical foregrip
      add(box(0.05, 0.11, 0.06), polymer, 0, -0.09, 0.06, 0.3); // pistol grip
      add(box(0.03, 0.02, 0.16), gunmetalDark, 0, 0.005, 0.2); // folding stock, thin
      add(box(0.012, 0.025, 0.012), recess, 0, 0.055, -0.38); // front sight
      add(box(0.03, 0.02, 0.015), recess, 0, 0.055, 0.04); // rear sight
      guard(0, -0.06, -0.01);
      muzzleZ = -0.41;
    } else if (id === 'shotgun') {
      // Boar 12: a wide barrel over a tube magazine, a pump that slides on
      // it, wood furniture, a bead sight.
      add(box(0.075, 0.085, 0.34), gunmetal, 0, 0, -0.04); // receiver
      add(cyl(0.028, 0.42), gunmetalDark, 0, 0.015, -0.32, Math.PI / 2); // barrel
      add(cyl(0.02, 0.36), gunmetal, 0, -0.03, -0.3, Math.PI / 2); // mag tube
      add(box(0.08, 0.07, 0.16), wood, 0, -0.03, -0.3); // pump
      add(box(0.06, 0.1, 0.2), wood, 0, -0.01, 0.2); // wood stock
      add(box(0.05, 0.11, 0.06), wood, 0, -0.09, 0.06, 0.3); // grip
      add(new THREE.SphereGeometry(0.008, 8, 6), recess, 0, 0.05, -0.52); // bead sight
      guard(0, -0.06, -0.01);
      muzzleZ = -0.53;
    } else if (id === 'sniper') {
      // Longshadow L9: a long heavy barrel, a scope on mounts, a bolt handle,
      // a long stock with a cheek rest.
      add(box(0.07, 0.09, 0.36), gunmetal, 0, 0, -0.02); // receiver
      add(cyl(0.017, 0.52), gunmetalDark, 0, 0.01, -0.44, Math.PI / 2); // long barrel
      add(box(0.065, 0.065, 0.26), polymer, 0, -0.005, -0.3); // handguard
      add(cyl(0.032, 0.2, 12), gunmetalDark, 0, 0.075, -0.06, Math.PI / 2); // scope tube
      add(cyl(0.038, 0.03, 12), gunmetalDark, 0, 0.075, -0.15, Math.PI / 2); // objective bell
      add(box(0.02, 0.03, 0.02), recess, 0, 0.045, -0.02); // scope mount
      add(box(0.02, 0.03, 0.02), recess, 0, 0.045, -0.1); // scope mount
      add(cyl(0.012, 0.07, 8), gunmetal, 0.05, 0.01, 0.04, 0, 0, Math.PI / 2.4); // bolt handle
      add(box(0.045, 0.12, 0.07), polymer, 0, -0.1, -0.06, 0.12); // magazine
      add(box(0.06, 0.11, 0.24), polymerTan, 0, -0.01, 0.22); // stock + cheek rest
      add(box(0.05, 0.11, 0.06), polymer, 0, -0.09, 0.06, 0.3); // pistol grip
      guard(0, -0.06, -0.01);
      muzzleZ = -0.7;
    } else {
      // Juniper R7: the cover rifle. Receiver, handguard with vent strips,
      // barrel + muzzle brake, curved magazine, stock, grip, iron sights,
      // charging handle, ejection port, trigger guard.
      add(box(0.07, 0.09, 0.3), gunmetal, 0, 0, -0.04); // receiver
      add(box(0.075, 0.07, 0.26), polymer, 0, -0.005, -0.28); // handguard
      add(box(0.078, 0.012, 0.22), gunmetalDark, 0, 0.028, -0.28); // handguard top rail
      add(box(0.01, 0.03, 0.18), recess, 0.038, 0, -0.28); // vent strip, right
      add(box(0.01, 0.03, 0.18), recess, -0.038, 0, -0.28); // vent strip, left
      add(cyl(0.019, 0.3), gunmetalDark, 0, 0.01, -0.36, Math.PI / 2); // barrel
      add(box(0.035, 0.035, 0.06), gunmetalDark, 0, 0.01, -0.5); // muzzle brake
      add(box(0.05, 0.15, 0.08), polymer, 0, -0.1, -0.07, 0.18); // curved magazine
      add(box(0.06, 0.1, 0.22), polymer, 0, -0.01, 0.2); // stock
      add(box(0.065, 0.12, 0.03), polymerTan, 0, -0.01, 0.32); // butt plate
      add(box(0.05, 0.11, 0.06), polymer, 0, -0.09, 0.07, 0.3); // pistol grip
      add(box(0.015, 0.035, 0.015), recess, 0, 0.055, -0.44); // front sight post
      add(box(0.035, 0.03, 0.02), recess, 0, 0.06, 0.08); // rear sight
      add(box(0.02, 0.02, 0.05), gunmetalDark, 0.045, 0.015, -0.02); // charging handle
      add(box(0.004, 0.03, 0.09), recess, 0.036, 0.01, -0.06); // ejection port
      guard(0, -0.06, -0.01);
      muzzleZ = -0.53;
    }
    g.position.set(0.26, -0.26, -0.5);
    g.scale.setScalar(0.72);
    g.userData.muzzleZ = muzzleZ;
    return g;
  }

  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = buildModel(id);
    models[id].visible = false;
    camera.add(models[id]);
  }

  // Muzzle flash: a soft radial glow, not a flat card. Its z follows the
  // equipped weapon's muzzle, so it never floats in front of a short gun.
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

  function placeFlash() {
    // Camera-space z of the muzzle tip: the model sits at z=-0.5, scaled 0.72.
    flash.position.z = -0.5 + models[state.id].userData.muzzleZ * 0.72 - 0.02;
  }
  placeFlash();

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
      placeFlash();
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
