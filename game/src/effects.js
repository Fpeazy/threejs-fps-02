// Effects: stunning but light (game-feel + genart-ops + shader-programming).
// Everything is pooled and capped, no per-frame allocation. Juice never touches
// the sim: trauma shake moves the camera rotation only, hit-stop scales the
// frame delta only. One shared point light for explosions; the muzzle flash
// light lives on the weapon. Additive sprites give the glow — no bloom pass.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 300;
const TRACER_LIFE = 0.08;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 220, 150, 1)');
  grad.addColorStop(0.35, 'rgba(255, 179, 71, 0.7)');
  grad.addColorStop(1, 'rgba(255, 179, 71, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createEffects(scene, camera) {
  const glowTex = glowTexture();
  const tmpColor = new THREE.Color();

  // Tracers: a pool of thin lines, each alive 80 ms.
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // Impact particles: one THREE.Points, 300 particles, parked at y=-100 when dead.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i += 1) pPos[i * 3 + 1] = -100;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    parts.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
  }
  let partIdx = 0;

  // Explosion ring: one mesh, scaled up and faded over 0.5 s.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.5, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringLife = 0;

  // One shared explosion/beacon light (no shadow: point-light shadows render 6x).
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(boomLight);
  let boomLeft = 0;

  // Bomb beacon: a device + a fresnel rim shell (shader-programming Pattern 4)
  // that pulses while the bomb is armed.
  const beaconGroup = new THREE.Group();
  const device = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4, metalness: 0.5 }),
  );
  device.position.y = 0.1;
  const beaconLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a') }),
  );
  beaconLamp.position.y = 0.26;
  const shellMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ff5a2a') } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.0); float pulse = 0.55 + 0.45 * sin(uTime * 6.0); gl_FragColor = vec4(uColor * f * pulse, f * pulse * 0.6); }',
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), shellMat);
  shell.position.y = 0.5;
  beaconGroup.add(device, beaconLamp, shell);
  beaconGroup.visible = false;
  scene.add(beaconGroup);
  const beaconLight = new THREE.PointLight(new THREE.Color('#ff5a2a'), 0, 10);
  scene.add(beaconLight);
  let beaconOn = false;

  // Trauma shake (game-feel Pattern 1): trauma^2, summed sines, real-time decay.
  let trauma = 0;
  let shakeT = 0;
  let hitStopLeft = 0;
  let hitStopId = 0;

  function spawnTracer(from, to) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % MAX_TRACERS;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = TRACER_LIFE;
  }

  function spawnBurst(pos, colorHex, n, speed, up = 2) {
    tmpColor.set(colorHex);
    for (let k = 0; k < n; k += 1) {
      const p = parts[partIdx];
      const i = partIdx;
      partIdx = (partIdx + 1) % MAX_PARTICLES;
      pPos[i * 3] = pos.x;
      pPos[i * 3 + 1] = pos.y;
      pPos[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      p.vx = Math.cos(a) * r;
      p.vy = Math.random() * up;
      p.vz = Math.sin(a) * r;
      p.life = 0.35 + Math.random() * 0.35;
      p.max = p.life;
      pCol[i * 3] = tmpColor.r;
      pCol[i * 3 + 1] = tmpColor.g;
      pCol[i * 3 + 2] = tmpColor.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  return {
    spawnTracer,
    spawnBurst,
    explode(pos) {
      ring.position.set(pos.x, 0.12, pos.z);
      ring.scale.set(0.5, 0.5, 0.5);
      ring.material.opacity = 0.95;
      ring.visible = true;
      ringLife = 0.5;
      boomLight.position.set(pos.x, 1.2, pos.z);
      boomLight.intensity = 60;
      boomLeft = 0.4;
      spawnBurst(pos, PALETTE.accent, 40, 6, 5);
      spawnBurst(pos, '#ff5a2a', 20, 4, 4);
      this.shake(0.8);
    },
    beacon: {
      place(pos) {
        beaconGroup.position.set(pos.x, 0, pos.z);
        beaconGroup.visible = true;
        beaconLight.position.set(pos.x, 1, pos.z);
        beaconOn = true;
      },
      remove() {
        beaconGroup.visible = false;
        beaconLight.intensity = 0;
        beaconOn = false;
      },
    },
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    hitStop(duration = 0.06) {
      hitStopId += 1;
      hitStopLeft = Math.max(hitStopLeft, duration);
    },
    hitStopActive() {
      return hitStopLeft > 0;
    },
    consumeHitStop(realDt) {
      if (hitStopLeft <= 0) return 1;
      hitStopLeft = Math.max(0, hitStopLeft - realDt);
      return 0.05;
    },
    step(dt, realDt, time) {
      // Tracers fade out.
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, (t.life / TRACER_LIFE) * 0.9);
        if (t.life <= 0) t.line.visible = false;
      }
      // Particles integrate; dead ones park below the floor.
      let moved = false;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          pPos[i * 3 + 1] = -100;
          moved = true;
          continue;
        }
        p.vy -= 9 * dt;
        pPos[i * 3] += p.vx * dt;
        pPos[i * 3 + 1] += p.vy * dt;
        pPos[i * 3 + 2] += p.vz * dt;
        if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
        moved = true;
      }
      if (moved) pGeo.attributes.position.needsUpdate = true;
      // Explosion ring expands and fades.
      if (ringLife > 0) {
        ringLife -= dt;
        const t = 1 - ringLife / 0.5;
        const s = 0.5 + t * 13;
        ring.scale.set(s, s, s);
        ring.material.opacity = Math.max(0, 0.95 * (1 - t));
        if (ringLife <= 0) ring.visible = false;
      }
      if (boomLeft > 0) {
        boomLeft -= dt;
        boomLight.intensity = Math.max(0, 60 * (boomLeft / 0.4));
      }
      // Bomb beacon pulses.
      if (beaconOn) {
        shellMat.uniforms.uTime.value = time;
        beaconLamp.visible = Math.sin(time * 8) > -0.2;
        beaconLight.intensity = 6 + 4 * Math.sin(time * 6);
      }
      // Trauma shake decays in real time and writes the camera offset only.
      if (trauma > 0) {
        trauma = Math.max(0, trauma - 1.2 * realDt);
        const sh = trauma * trauma;
        shakeT += realDt * 30;
        camera.rotation.x += 0.012 * sh * Math.sin(shakeT * 1.7);
        camera.rotation.y += 0.012 * sh * Math.sin(shakeT * 2.3);
        camera.rotation.z += 0.004 * sh * Math.sin(shakeT * 1.1);
      }
    },
    glowTexture: glowTex,
  };
}
