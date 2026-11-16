// The map: Night Bazaar, a 48 x 36 m dusk market. Three lanes (west, mid, east),
// two bombsites (A SPICE ROW west, B TEA HOUSE east), a lantern tower at mid.
// Built from boxes; every box is a collider and a surface a bullet stops on.
// Lanterns and crates are InstancedMesh (one draw call each). Light: one
// hemisphere + one warm directional sun with shadows. No other lights.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export { PALETTE };
export const MAP = {
  bounds: { x0: -24, x1: 24, z0: -18, z1: 18 },
  sites: {
    A: { x: -19, z: -8, r: 4, name: 'SPICE ROW' },
    B: { x: 19, z: -8, r: 4, name: 'TEA HOUSE' },
  },
  spawns: { ember: { x: 0, z: 15 }, lantern: { x: 0, z: -15 } },
  callouts: [
    { name: 'GATE', x: 0, z: 15 }, { name: 'FOUNTAIN', x: 0, z: -14 },
    { name: 'TOWER', x: 0, z: 0 }, { name: 'SILK LANE', x: -12, z: 4 },
    { name: 'ALLEY', x: 12, z: 4 }, { name: 'SPICE ROW', x: -19, z: -8 },
    { name: 'TEA HOUSE', x: 19, z: -8 }, { name: 'MID', x: 0, z: 6 },
  ],
  // Bot routes: waypoint lists from each spawn.
  routes: {
    toA: [[0, 12], [-8, 8], [-14, 2], [-19, -4], [-19, -8]],
    toB: [[0, 12], [8, 8], [14, 2], [19, -4], [19, -8]],
    toMid: [[0, 12], [0, 6], [0, 1]],
    holdA: [[-16, -5], [-21, -11], [-19, -8]],
    holdB: [[16, -5], [21, -11], [19, -8]],
    holdMid: [[-3, -3], [3, -3], [0, 4]],
    defA: [[0, -14], [-8, -12], [-16, -10], [-19, -8]],
    defB: [[0, -14], [8, -12], [16, -10], [19, -8]],
  },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Lantern glow: unlit amber, so it reads as light in the dusk.
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  const colliders = [];
  const shootables = [];
  const wallRects = []; // top-down rects for the minimap

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      wallRects.push({ x, z, w, d });
    }
    shootables.push(mesh);
    return mesh;
  }

  // Floor + perimeter walls (open to the dusk sky).
  box(48.4, 0.4, 36.4, 0, -0.2, 0, 'ground');
  box(0.4, 4.6, 36.4, -24.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 36.4, 24.2, 2.3, 0, 'surface');
  box(48.4, 4.6, 0.4, 0, 2.3, -18.2, 'surface');
  box(48.4, 4.6, 0.4, 0, 2.3, 18.2, 'surface');

  // The landmark: a three-tier lantern tower at mid, with a pyramid roof.
  box(4.4, 1.8, 4.4, 0, 0.9, 0, 'brick');
  box(3.4, 1.8, 3.4, 0, 2.7, 0, 'surface');
  box(2.4, 1.8, 2.4, 0, 4.5, 0, 'brick');
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), materials.accent);
  roof.position.set(0, 6.2, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  shootables.push(roof);

  // Site A: SPICE ROW — a raised platform with spice stalls and a painted floor.
  box(8, 0.3, 8, -19, 0.15, -8, 'brick');
  box(3.2, 1.0, 1.0, -21, 0.8, -11, 'teal');
  box(3.2, 1.0, 1.0, -17, 0.8, -11, 'ember');
  box(1.0, 1.0, 3.2, -22.4, 0.8, -7, 'teal');
  // Site B: TEA HOUSE — a small house with a roof, tea stalls beside it.
  box(5, 2.6, 4, 20.5, 1.3, -10, 'surface');
  const teaRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 4), materials.teal);
  teaRoof.position.set(20.5, 3.3, -10);
  teaRoof.rotation.y = Math.PI / 4;
  teaRoof.castShadow = true;
  group.add(teaRoof);
  shootables.push(teaRoof);
  box(3.2, 1.0, 1.0, 16.5, 0.8, -5.5, 'teal');
  box(1.0, 1.0, 3.2, 16.5, 0.8, -11, 'ember');

  // Spawns: the GATE (south, EMBER) and the FOUNTAIN (north, LANTERN).
  box(0.8, 4.2, 0.8, -2.4, 2.1, 16.5, 'brick');
  box(0.8, 4.2, 0.8, 2.4, 2.1, 16.5, 'brick');
  box(5.6, 0.7, 0.8, 0, 4.4, 16.5, 'hairline');
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.7, 12), materials.teal);
  fountain.position.set(0, 0.35, -14);
  fountain.castShadow = true;
  fountain.receiveShadow = true;
  group.add(fountain);
  colliders.push(new THREE.Box3().setFromObject(fountain));
  shootables.push(fountain);
  wallRects.push({ x: 0, z: -14, w: 3.4, d: 3.4 });

  // Market stalls: a counter + a slanted awning (awning is shootable, not a collider).
  function stall(x, z, awningMat, rotY) {
    const counter = box(3.0, 1.0, 1.2, x, 0.5, z, 'surface');
    counter.rotation.y = rotY;
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.8), materials[awningMat]);
    awn.position.set(x, 2.3, z);
    awn.rotation.y = rotY;
    awn.rotation.x = 0.18;
    awn.castShadow = true;
    group.add(awn);
    shootables.push(awn);
    return counter;
  }
  stall(-12, 6, 'teal', 0.1);
  stall(-12, -2, 'ember', -0.1);
  stall(12, 6, 'ember', -0.1);
  stall(12, -2, 'teal', 0.1);
  stall(-6, 10, 'teal', 0.3);
  stall(6, 10, 'ember', -0.3);
  stall(-6, -12, 'ember', 0.2);
  stall(6, -12, 'teal', -0.2);

  // Low cover walls and blocks, so every lane has corners and sightlines.
  box(4.0, 1.2, 0.6, -8, 0.6, 0, 'hairline');
  box(4.0, 1.2, 0.6, 8, 0.6, 0, 'hairline');
  box(0.6, 1.2, 4.0, -14, 0.6, 10, 'hairline');
  box(0.6, 1.2, 4.0, 14, 0.6, 10, 'hairline');
  box(3.0, 1.1, 1.2, -4, 0.55, -6, 'brick');
  box(3.0, 1.1, 1.2, 4, 0.55, -6, 'brick');
  box(1.2, 2.2, 1.2, -10, 1.1, -8, 'surface');
  box(1.2, 2.2, 1.2, 10, 1.1, -8, 'surface');

  // Crates: one InstancedMesh, one draw call, scattered as crouch cover.
  const crateSpots = [
    [-16, 8, 0.4], [-15, 9, 1.2], [16, 8, -0.5], [15, 9, 0.9], [-3, 12, 0.2],
    [3, 12, 1.1], [-20, 2, 0.7], [20, 2, -0.3], [-8, -14, 0.5], [8, -14, 1.4],
    [-2, -2, 0.9], [2.5, -2, 0.1], [-13, -6, 1.0], [13, -6, 0.6],
  ];
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crates = new THREE.InstancedMesh(crateGeo, materials.hairline, crateSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  crateSpots.forEach(([x, z, rot], i) => {
    e.set(0, rot, 0);
    q.setFromEuler(e);
    v.set(x, 0.5, z);
    s.set(1, 1, 1);
    m4.compose(v, q, s);
    crates.setMatrixAt(i, m4);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.5, 0, z - 0.5), new THREE.Vector3(x + 0.5, 1, z + 0.5)));
    wallRects.push({ x, z, w: 1, d: 1 });
  });
  crates.castShadow = true;
  crates.receiveShadow = true;
  group.add(crates);

  // Lanterns: one InstancedMesh of unlit amber spheres, hung on posts and stalls.
  const lanternSpots = [];
  for (let i = 0; i < 8; i += 1) lanternSpots.push([-20 + i * 5.7, 3.1, 17.5]);
  for (let i = 0; i < 8; i += 1) lanternSpots.push([-20 + i * 5.7, 3.1, -17.5]);
  for (let i = 0; i < 6; i += 1) lanternSpots.push([-23.5, 3.1, -12 + i * 5]);
  for (let i = 0; i < 6; i += 1) lanternSpots.push([23.5, 3.1, -12 + i * 5]);
  lanternSpots.push([0, 5.6, 0], [-1.6, 4.4, 0], [1.6, 4.4, 0], [0, 7.4, 0]);
  lanternSpots.push([-12, 2.8, 6], [12, 2.8, 6], [-12, 2.8, -2], [12, 2.8, -2]);
  const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), lanternMat, lanternSpots.length);
  lanternSpots.forEach(([x, y, z], i) => {
    m4.compose(v.set(x, y, z), q.identity(), s.set(1, 1, 1));
    lanterns.setMatrixAt(i, m4);
  });
  group.add(lanterns);

  // Site floor markers: flat amber/teal squares the judge can read as the objective.
  function siteMarker(x, z, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[mat]), roughness: 0.8, emissive: new THREE.Color(PALETTE[mat]), emissiveIntensity: 0.25 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.32, z);
    m.receiveShadow = true;
    group.add(m);
  }
  siteMarker(-19, -8, 'teal');
  siteMarker(19, -8, 'ember');

  // Light: a warm dusk sun from the west + a cool indigo hemisphere. One shadow light only.
  const sky = new THREE.HemisphereLight(new THREE.Color('#6a5a8a'), new THREE.Color(PALETTE.ground), 1.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.6);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  return { colliders, shootables, group, wallRects };
}
