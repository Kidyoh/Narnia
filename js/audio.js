// All sound is synthesized with WebAudio: no audio files to download.
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5, 1568.0, 1760.0];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.nextNote = 0;
    this.step = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.setupWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setupWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windFilter = bp;
    src.connect(bp).connect(this.windGain).connect(this.master);
    src.start();
  }

  wind(speed, active) {
    if (!this.ctx) return;
    const v = active ? Math.min(1, speed / 1000) : 0;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(v * v * 0.12, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + v * 900, t, 0.2);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, { vol = 0.3, freq = 800, sweep = 0, at = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump':
        this.tone(320, 0.16, { type: 'triangle', vol: 0.15, slide: 260 });
        this.burst(0.12, { vol: 0.08, freq: 2000 });
        break;
      case 'land':
        this.burst(0.14, { vol: 0.18, freq: 500, sweep: -300 });
        break;
      case 'daisy': {
        const f = PENTA[Math.min(arg, PENTA.length - 1)];
        this.tone(f, 0.35, { vol: 0.12 });
        this.tone(f * 2, 0.2, { vol: 0.04 });
        break;
      }
      case 'flip':
        for (let i = 0; i < Math.min(arg, 4) + 1; i++) this.tone(PENTA[2 + i * 2], 0.25, { vol: 0.1, at: i * 0.07, type: 'triangle' });
        break;
      case 'perfect':
        this.tone(783.99, 0.25, { vol: 0.12 });
        this.tone(1174.66, 0.35, { vol: 0.1, at: 0.08 });
        break;
      case 'crash':
        this.burst(0.5, { vol: 0.35, freq: 1200, sweep: -1100 });
        this.tone(140, 0.35, { vol: 0.25, slide: -90 });
        break;
      case 'checkpoint':
        [659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.5, { vol: 0.1, at: i * 0.09 }));
        break;
      case 'finish':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.8, { vol: 0.11, at: i * 0.11, type: 'triangle' }));
        break;
      case 'click':
        this.tone(880, 0.06, { vol: 0.06, type: 'triangle' });
        break;
    }
  }

  // A soft music-box melody, generated from a pentatonic scale.
  startMusic(seed = 1) {
    this.musicOn = true;
    this.musicSeed = seed;
    this.step = 0;
    if (this.ctx) this.nextNote = this.ctx.currentTime + 0.3;
  }

  stopMusic() {
    this.musicOn = false;
  }

  tick() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const beat = 0.32;
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    while (this.nextNote < this.ctx.currentTime + 0.2) {
      const s = this.step;
      const bar = Math.floor(s / 8) % 4;
      const roots = [0, 3, 4, 2];
      if (s % 8 === 0) this.tone(scale[roots[bar]] / 2, beat * 7, { vol: 0.05, at: this.nextNote - this.ctx.currentTime, type: 'sine', attack: 0.05 });
      const r = Math.sin((s + 1) * 12.9898 * this.musicSeed) * 43758.5453;
      const h = r - Math.floor(r);
      if (h < 0.62 || s % 4 === 0) {
        const idx = (roots[bar] + Math.floor(h * 5) + (s % 4 === 0 ? 2 : 0)) % scale.length;
        this.tone(scale[idx], 0.9, { vol: 0.045, at: this.nextNote - this.ctx.currentTime, type: 'triangle', attack: 0.01 });
      }
      this.nextNote += beat;
      this.step++;
    }
  }
}
