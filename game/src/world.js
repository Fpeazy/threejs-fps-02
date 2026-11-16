// The map: Night Bazaar, a 48 x 36 m dusk market. Three lanes (west, mid, east),
// two bombsites (A SPICE ROW west, B TEA HOUSE east), a lantern tower at mid.
// Built from boxes; every box is a collider and a surface a bullet stops on.
// Lanterns and crates are InstancedMesh (one draw call each).
//
// Realistic register (not cartoon): surfaces carry procedural textures
// (brick, worn wood, stone, packed earth) instead of flat colour fields;
// the big flat red wall is terracotta brick, the site floors are worn stone
// with a thin painted border, not flat teal. Crispness comes from the light
// rig — a strong warm sun with hard shadows, cool moonlight fill, warm
// lantern point lights — plus thin trim strips on every edge, not from
// brighter colours.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { brickTexture, woodTexture, stoneTexture, groundTexture } from './textures.js';

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

  // Flat palette materials (accents and trim) plus the textured ones.
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.88,
      metalness: 0.03,
    });
  }
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.85, metalness: 0.02 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8, metalness: 0.02 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9, metalness: 0.02 });
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.0 });
  // Lantern glow: unlit amber, so it reads as light in the dusk.
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  const colliders = [];
  const shootables = [];
  const wallRects = []; // top-down rects for the minimap

  // mat is a palette name or a THREE.Material. trim adds a thin lighter
  // strip on the top edge, so the shape reads as hard, not a soft blob.
  function box(w, h, d, x, y, z, mat, collide = true, trim = false) {
    const material = typeof mat === 'string' ? materials[mat] : mat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      wallRects.push({ x, z, w, d });
    }
    shootables.push(mesh);
    if (trim) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), materials.hairline);
      cap.position.set(x, y + h / 2 + 0.02, z);
      cap.castShadow = true;
      cap.receiveShadow = true;
      group.add(cap);
      shootables.push(cap);
    }
    return mesh;
  }

  // Floor (packed earth, textured) + perimeter walls (terracotta brick).
  box(48.4, 0.4, 36.4, 0, -0.2, 0, groundMat);
  box(0.4, 4.6, 36.4, -24.2, 2.3, 0, brickMat);
  box(0.4, 4.6, 36.4, 24.2, 2.3, 0, brickMat);
  box(48.4, 4.6, 0.4, 0, 2.3, -18.2, brickMat);
  box(48.4, 4.6, 0.4, 0, 2.3, 18.2, brickMat);
  // Wall caps: a lighter wood strip along the top of each perimeter wall.
  for (const [w, d, x, z] of [[48.4, 0.5, 0, -18.2], [48.4, 0.5, 0, 18.2], [0.5, 36.4, -24.2, 0], [0.5, 36.4, 24.2, 0]]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), materials.hairline);
    cap.position.set(x, 4.66, z);
    cap.castShadow = true;
    group.add(cap);
  }

  // The landmark: a three-tier lantern tower at mid, brick with wood trim
  // rings, a terracotta pyramid roof, and a subtle warm fresnel rim shell
  // (FrontSide, low opacity) that reads as lantern rim light on its edges.
  box(4.4, 1.8, 4.4, 0, 0.9, 0, brickMat, true, true);
  box(3.4, 1.8, 3.4, 0, 2.7, 0, woodMat, true, true);
  box(2.4, 1.8, 2.4, 0, 4.5, 0, brickMat, true, true);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), brickMat);
  roof.position.set(0, 6.2, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  shootables.push(roof);
  const rimMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(PALETTE.accent) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.0); gl_FragColor = vec4(uColor * f, f * 0.28); }',
  });
  const rim = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.9, 3.7), rimMat);
  rim.position.set(0, 2.7, 0);
  group.add(rim);

  // Site A: SPICE ROW — a raised wooden platform with spice stalls.
  box(8, 0.3, 8, -19, 0.15, -8, woodMat);
  box(3.2, 1.0, 1.0, -21, 0.8, -11, woodMat, true, true);
  box(3.2, 1.0, 1.0, -17, 0.8, -11, woodMat, true, true);
  box(1.0, 1.0, 3.2, -22.4, 0.8, -7, woodMat, true, true);
  // Site B: TEA HOUSE — a small wooden house with a roof, tea stalls beside it.
  box(5, 2.6, 4, 20.5, 1.3, -10, woodMat, true, true);
  const teaRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 4), materials.teal);
  teaRoof.position.set(20.5, 3.3, -10);
  teaRoof.rotation.y = Math.PI / 4;
  teaRoof.castShadow = true;
  group.add(teaRoof);
  shootables.push(teaRoof);
  box(3.2, 1.0, 1.0, 16.5, 0.8, -5.5, woodMat, true, true);
  box(1.0, 1.0, 3.2, 16.5, 0.8, -11, woodMat, true, true);

  // Spawns: the GATE (south, EMBER) and the FOUNTAIN (north, LANTERN).
  box(0.8, 4.2, 0.8, -2.4, 2.1, 16.5, brickMat);
  box(0.8, 4.2, 0.8, 2.4, 2.1, 16.5, brickMat);
  box(5.6, 0.7, 0.8, 0, 4.4, 16.5, 'hairline');
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.7, 12), stoneMat);
  fountain.position.set(0, 0.35, -14);
  fountain.castShadow = true;
  fountain.receiveShadow = true;
  group.add(fountain);
  colliders.push(new THREE.Box3().setFromObject(fountain));
  shootables.push(fountain);
  wallRects.push({ x: 0, z: -14, w: 3.4, d: 3.4 });

  // Market stalls: a wooden counter + a slanted awning (awning is shootable,
  // not a collider). Each counter carries a lighter trim strip on its top edge.
  function stall(x, z, awningMat, rotY) {
    const counter = box(3.0, 1.0, 1.2, x, 0.5, z, woodMat, true, true);
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
  box(4.0, 1.2, 0.6, -8, 0.6, 0, 'hairline', true, true);
  box(4.0, 1.2, 0.6, 8, 0.6, 0, 'hairline', true, true);
  box(0.6, 1.2, 4.0, -14, 0.6, 10, 'hairline', true, true);
  box(0.6, 1.2, 4.0, 14, 0.6, 10, 'hairline', true, true);
  box(3.0, 1.1, 1.2, -4, 0.55, -6, brickMat, true, true);
  box(3.0, 1.1, 1.2, 4, 0.55, -6, brickMat, true, true);
  box(1.2, 2.2, 1.2, -10, 1.1, -8, woodMat, true, true);
  box(1.2, 2.2, 1.2, 10, 1.1, -8, woodMat, true, true);

  // Crates: one InstancedMesh, one draw call, scattered as crouch cover.
  const crateSpots = [
    [-16, 8, 0.4], [-15, 9, 1.2], [16, 8, -0.5], [15, 9, 0.9], [-3, 12, 0.2],
    [3, 12, 1.1], [-20, 2, 0.7], [20, 2, -0.3], [-8, -14, 0.5], [8, -14, 1.4],
    [-2, -2, 0.9], [2.5, -2, 0.1], [-13, -6, 1.0], [13, -6, 0.6],
  ];
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crates = new THREE.InstancedMesh(crateGeo, woodMat, crateSpots.length);
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

  // Site markers: worn stone floors with a thin painted border in the
  // site's team colour — a marked zone, not a flat colour field.
  function siteMarker(x, z, mat) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), stoneMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.32, z);
    floor.receiveShadow = true;
    group.add(floor);
    const borderMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[mat]), roughness: 0.6, emissive: new THREE.Color(PALETTE[mat]), emissiveIntensity: 0.35 });
    const half = 3.8;
    const t = 0.18;
    for (const [bw, bd, bx, bz] of [[7.6, t, 0, -half], [7.6, t, 0, half], [t, 7.6, -half, 0], [t, 7.6, half, 0]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, bd), borderMat);
      strip.position.set(x + bx, 0.35, z + bz);
      group.add(strip);
    }
  }
  siteMarker(-19, -8, 'teal');
  siteMarker(19, -8, 'ember');

  // Light: a strong warm sun from the west (the key, hard shadows) + cool
  // indigo moonlight from the hemisphere + warm lantern point lights over
  // the stall rows and the two sites (fake, unshadowed, cheap).
  const sky = new THREE.HemisphereLight(new THREE.Color('#7a6ab0'), new THREE.Color('#4a3a28'), 1.3);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffc27a'), 3.8);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // Warm lantern glow: four unshadowed point lights (point-light shadows
  // render the scene six times each, so these never cast shadows).
  for (const [x, z] of [[-12, 2], [12, 2], [-19, -8], [19, -8]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 14, 2);
    lamp.position.set(x, 3.2, z);
    scene.add(lamp);
  }

  return { colliders, shootables, group, wallRects };
}
