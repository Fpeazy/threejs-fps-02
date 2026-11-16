// Procedural WebAudio: no audio assets, no network. Every sound is a small
// oscillator/noise recipe, created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!ensure()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainVal;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq, dur, gainVal, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(id) {
      if (id === 'sniper') { noise(0.22, 900, 0.9); tone(160, 0.12, 0.4, 'sawtooth', 60); }
      else if (id === 'shotgun') { noise(0.25, 700, 1.0); tone(120, 0.15, 0.5, 'sawtooth', 50); }
      else if (id === 'smg') { noise(0.08, 1600, 0.5); }
      else { noise(0.12, 1200, 0.7); tone(220, 0.06, 0.25, 'square', 90); }
    },
    enemyShot() { noise(0.1, 900, 0.25); },
    reload() { tone(900, 0.05, 0.2, 'square'); setTimeout(() => tone(1200, 0.05, 0.2, 'square'), 120); },
    hit() { tone(1800, 0.05, 0.3, 'sine'); },
    kill() { tone(1200, 0.07, 0.3, 'sine'); setTimeout(() => tone(1600, 0.09, 0.3, 'sine'), 70); },
    hurt() { tone(140, 0.15, 0.4, 'sawtooth', 70); },
    explosion() { noise(0.7, 400, 1.0); tone(90, 0.6, 0.7, 'sine', 30); },
    plantBeep() { tone(1000, 0.08, 0.25, 'square'); },
    defuseBeep() { tone(1400, 0.08, 0.25, 'square'); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.3, 'sine'), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.3, 'sine'), i * 120)); },
    buy() { tone(700, 0.06, 0.25, 'sine'); setTimeout(() => tone(1000, 0.06, 0.25, 'sine'), 60); },
  };
}
