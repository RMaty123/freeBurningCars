/**
 * Zvuky syntetizované přes Web Audio – motor, střelba, výbuchy, pípání odpočtu.
 * Žádné zvukové soubory. Prohlížeč povolí zvuk až po prvním kliknutí / stisku klávesy na obrazovce.
 */

interface Engine { o1: OscillatorNode; o2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; }

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private engines = new Map<number, Engine>();
  private lastShot = 0;
  muted = false;

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Volat z obsluhy kliknutí / klávesy. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }

  // ---------------------------------------------------------------- motory
  setEngines(carIds: number[]) {
    if (!this.ctx) return;
    for (const [id, e] of this.engines) {
      if (!carIds.includes(id)) { e.o1.stop(); e.o2.stop(); e.gain.disconnect(); this.engines.delete(id); }
    }
    for (const id of carIds) {
      if (this.engines.has(id)) continue;
      const ctx = this.ctx;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 2;
      const gain = ctx.createGain(); gain.gain.value = 0;
      o1.connect(filter); o2.connect(filter); filter.connect(gain).connect(this.master);
      o1.start(); o2.start();
      this.engines.set(id, { o1, o2, filter, gain });
    }
  }

  updateEngine(id: number, speed: number, top: number, throttle: number, nitro: boolean, silent: boolean) {
    const e = this.engines.get(id);
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const span = top / 4;
    const s = Math.abs(speed);
    const gear = Math.min(3, Math.floor(s / span));
    const frac = Math.min(1.2, (s - gear * span) / span);
    const rpm = (gear === 0 ? 0.12 : 0.38) + frac * (gear === 0 ? 0.88 : 0.62);
    const f = 46 + rpm * 105 + gear * 7 + (nitro ? 18 : 0);
    e.o1.frequency.setTargetAtTime(f, t, 0.04);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    e.filter.frequency.setTargetAtTime(260 + rpm * 1500 + throttle * 700, t, 0.05);
    const vol = silent ? 0 : (0.035 + throttle * 0.045 + (nitro ? 0.03 : 0)) / Math.sqrt(Math.max(1, this.engines.size));
    e.gain.gain.setTargetAtTime(vol, t, 0.06);
  }

  // ---------------------------------------------------------------- jednorázové zvuky
  private burst(vol: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q = 1) {
    if (!this.ready || vol < 0.004) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(fl).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }

  private tone(vol: number, dur: number, type: OscillatorType, f0: number, f1: number, delay = 0) {
    if (!this.ready || vol < 0.004) return;
    const ctx = this.ctx!, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(vol: number) {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastShot < 0.04) return; // ať se střelba šesti aut neslije v šum
    this.lastShot = now;
    this.burst(vol * 0.32, 0.07, 'bandpass', 2400, 700, 0.8);
    this.tone(vol * 0.2, 0.05, 'square', 190, 70);
  }
  hit(vol: number) { this.burst(vol * 0.2, 0.05, 'highpass', 3000, 5000, 0.5); }
  /** Výstřel laseru: krátký "pshh" a klesající tón, délka podle toho, jak dlouho bude svítit. */
  beam(vol: number, len: number) {
    this.burst(vol * 0.3, Math.min(0.6, 0.15 + len * 0.1), 'bandpass', 900, 3200, 1.6);
    this.tone(vol * 0.45, Math.min(0.9, 0.2 + len * 0.15), 'sawtooth', 1200, 260);
    this.tone(vol * 0.25, Math.min(0.9, 0.2 + len * 0.15), 'square', 600, 130, 0.02);
  }
  /** Tiché cvaknutí, když je laser nabitý. */
  charged(vol: number) { this.tone(vol * 0.2, 0.08, 'square', 1500, 1900); }
  boom(vol: number, size: number) {
    this.burst(vol * 0.95, 0.5 + size * 0.5, 'lowpass', 1400, 60, 0.7);
    this.tone(vol * 0.8, 0.45 + size * 0.3, 'sine', 110, 28);
  }
  crash(vol: number) { this.burst(vol * 0.55, 0.22, 'lowpass', 900, 120, 1); this.tone(vol * 0.3, 0.12, 'triangle', 140, 50); }
  launch(vol: number) { this.burst(vol * 0.4, 0.5, 'bandpass', 500, 2600, 1.4); }
  /** EMP vlna: hluboké bouchnutí a rozjíždějící se elektrické zavytí. */
  wave(vol: number) {
    this.burst(vol * 0.5, 0.35, 'lowpass', 900, 160, 1.0);
    this.tone(vol * 0.3, 0.5, 'sawtooth', 90, 900, 0.03);
  }
  /** EMP se začal nabíjet: krátké cvaknutí relé. */
  charge(vol: number) { this.tone(vol * 0.18, 0.1, 'square', 330, 660, 0.01); }
  /** Hák se zakousl do cizího auta: kovové cvaknutí a zadrnčení napnutého lana. */
  hook(vol: number) { this.burst(vol * 0.3, 0.07, 'bandpass', 900, 2400, 1.1); this.tone(vol * 0.22, 0.26, 'sawtooth', 240, 120, 0.02); }
  /** Položená mina: cvaknutí zámku a krátké pípnutí, že se natahuje. */
  mine(vol: number) { this.burst(vol * 0.22, 0.05, 'highpass', 2200, 2600, 0.6); this.tone(vol * 0.18, 0.07, 'square', 520, 760, 0.05); }
  pickup(vol: number) { this.tone(vol * 0.25, 0.09, 'triangle', 660, 680); this.tone(vol * 0.25, 0.14, 'triangle', 990, 1010, 0.08); }
  beep(high: boolean) { this.tone(0.3, high ? 0.6 : 0.18, 'square', high ? 880 : 440, high ? 880 : 440); }
  lap() { this.tone(0.2, 0.1, 'triangle', 784, 784); this.tone(0.2, 0.16, 'triangle', 1175, 1175, 0.1); }
  finish() { [523, 659, 784, 1047].forEach((f, i) => this.tone(0.24, 0.22, 'triangle', f, f, i * 0.12)); }
  respawn(vol: number) { this.tone(vol * 0.2, 0.3, 'sine', 300, 900); }
  ui() { this.tone(0.12, 0.05, 'square', 600, 600); }
}
