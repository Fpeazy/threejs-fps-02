// Procedural textures (no network, no assets): canvas-painted brick, wood
// planks and worn stone, so surfaces read as real materials instead of flat
// cartoon colour fields. Each texture is painted once at boot, repeated over
// its surface, and shared by every mesh that uses it. Colour variation is
// small and seeded, so two runs paint the same bytes.
import * as THREE from 'three';

function seeded(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vary(base, amount, rand) {
  // base is [r,g,b] 0-255; shift each channel by up to +/- amount.
  const c = base.map((v) => Math.max(0, Math.min(255, Math.round(v + (rand() * 2 - 1) * amount))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function canvasTexture(size, paint, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  paint(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Terracotta brick: courses of bricks with mortar lines and per-brick tone.
export function brickTexture() {
  const rand = seeded(7);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#5e4030'; // mortar
    g.fillRect(0, 0, s, s);
    const rows = 8;
    const bh = s / rows;
    for (let r = 0; r < rows; r += 1) {
      const off = (r % 2) * (s / 8);
      for (let i = -1; i < 5; i += 1) {
        const bw = s / 4;
        const x = i * bw + off;
        g.fillStyle = vary([156, 90, 56], 16, rand);
        g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        // A darker top edge on each brick: the course reads as separate blocks.
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x + 2, r * bh + 2, bw - 4, 3);
        // A faint warm highlight on the brick's lower edge (sun from above).
        g.fillStyle = 'rgba(255,200,140,0.10)';
        g.fillRect(x + 2, (r + 1) * bh - 5, bw - 4, 3);
      }
    }
  }, 6, 2);
}

// Worn wood planks: horizontal boards with grain streaks and per-board tone.
export function woodTexture() {
  const rand = seeded(21);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#4a3520';
    g.fillRect(0, 0, s, s);
    const planks = 6;
    const ph = s / planks;
    for (let p = 0; p < planks; p += 1) {
      g.fillStyle = vary([110, 82, 56], 12, rand);
      g.fillRect(0, p * ph + 1, s, ph - 2);
      // Grain: a few darker streaks along each board.
      for (let k = 0; k < 9; k += 1) {
        g.strokeStyle = `rgba(40,26,12,${0.12 + rand() * 0.18})`;
        g.lineWidth = 1;
        const y = p * ph + 3 + rand() * (ph - 6);
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + (rand() - 0.5) * 4, s * 0.7, y + (rand() - 0.5) * 4, s, y);
        g.stroke();
      }
      // A nail head at each board end.
      g.fillStyle = 'rgba(20,14,8,0.6)';
      g.beginPath();
      g.arc(8, p * ph + ph / 2, 2, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(s - 8, p * ph + ph / 2, 2, 0, Math.PI * 2);
      g.fill();
    }
  }, 2, 1);
}

// Worn stone tiles: large flags with speckle noise and dark joints.
export function stoneTexture() {
  const rand = seeded(42);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#3a3128'; // joints
    g.fillRect(0, 0, s, s);
    const tiles = 4;
    const ts = s / tiles;
    for (let ty = 0; ty < tiles; ty += 1) {
      for (let tx = 0; tx < tiles; tx += 1) {
        g.fillStyle = vary([122, 106, 84], 10, rand);
        g.fillRect(tx * ts + 2, ty * ts + 2, ts - 4, ts - 4);
        // Speckle: worn stone is never one flat tone.
        for (let k = 0; k < 60; k += 1) {
          g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,235,200,0.08)';
          g.fillRect(tx * ts + 2 + rand() * (ts - 4), ty * ts + 2 + rand() * (ts - 4), 2, 2);
        }
      }
    }
  }, 8, 6);
}

// Packed earth: a warm mid-brown ground with noise patches, no flat field.
export function groundTexture() {
  const rand = seeded(99);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#5a4632';
    g.fillRect(0, 0, s, s);
    for (let k = 0; k < 900; k += 1) {
      const v = rand();
      g.fillStyle = v < 0.5 ? 'rgba(30,20,10,0.12)' : 'rgba(200,160,110,0.10)';
      const r = 1 + rand() * 4;
      g.beginPath();
      g.arc(rand() * s, rand() * s, r, 0, Math.PI * 2);
      g.fill();
    }
    // A few darker worn patches where feet pass.
    for (let k = 0; k < 12; k += 1) {
      g.fillStyle = 'rgba(40,28,16,0.10)';
      g.beginPath();
      g.ellipse(rand() * s, rand() * s, 12 + rand() * 20, 8 + rand() * 12, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }, 10, 8);
}
