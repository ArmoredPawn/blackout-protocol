import { useApp } from "../store";

/**
 * All sounds are synthesised at runtime with WebAudio – original, license-free,
 * zero downloads. Positional sounds use HRTF panners so you can hear direction.
 */
type Vec = { x: number; y: number; z: number };

export type Sfx =
  | "step"
  | "stepHeavy"
  | "jump"
  | "land"
  | "swing"
  | "hit"
  | "blocked"
  | "pickup"
  | "pod"
  | "rescue"
  | "eliminated"
  | "escape"
  | "hacked"
  | "alarm"
  | "exitsPowered"
  | "exitOpen"
  | "abilityHunter"
  | "abilitySurvivor"
  | "struggle"
  | "skill"
  | "skillOk"
  | "skillFail"
  | "powerupGet"
  | "roundStart"
  | "roundEnd"
  | "click"
  | "hackTick"
  | "pulse"
  | "trap"
  | "recover";

class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private ambNodes: AudioNode[] = [];
  private ambTheme = "";

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    useApp.subscribe((s, p) => {
      if (s.prefs !== p.prefs) this.applyVolumes();
    });
  }

  applyVolumes() {
    if (!this.ctx) return;
    const { master, sfx, ambience, muted } = useApp.getState().prefs;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(muted ? 0 : master, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(ambience * 0.5, t, 0.2);
  }

  setListener(pos: Vec, fwd: Vec) {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.ctx!.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      (l as any).setPosition(pos.x, pos.y, pos.z);
      (l as any).setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  private out(at?: Vec, gain = 1): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (at) {
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "inverse";
      p.refDistance = 3;
      p.maxDistance = 60;
      p.rolloffFactor = 1.3;
      if (p.positionX) {
        p.positionX.value = at.x;
        p.positionY.value = at.y + 1;
        p.positionZ.value = at.z;
      } else (p as any).setPosition(at.x, at.y + 1, at.z);
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private burst(dest: AudioNode, t0: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + dur + 0.05);
  }

  play(name: Sfx, at?: Vec, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const o = this.out(at, vol);
    switch (name) {
      case "step":
        this.burst(o, t, 0.07, 0.25, "bandpass", 900 + Math.random() * 300, 1.2);
        break;
      case "stepHeavy":
        this.burst(o, t, 0.12, 0.5, "lowpass", 380, 1);
        this.tone(o, "sine", 80, 50, t, 0.12, 0.3);
        break;
      case "jump":
        this.burst(o, t, 0.08, 0.15, "highpass", 1500);
        break;
      case "land":
        this.burst(o, t, 0.1, 0.3, "lowpass", 500);
        break;
      case "swing":
        this.burst(o, t, 0.28, 0.45, "bandpass", 500, 2, 2600);
        break;
      case "hit":
        this.tone(o, "sine", 160, 40, t, 0.35, 0.9);
        this.burst(o, t, 0.2, 0.6, "lowpass", 900);
        this.tone(o, "square", 880, 220, t + 0.02, 0.25, 0.15);
        break;
      case "blocked":
        this.tone(o, "triangle", 1200, 900, t, 0.25, 0.4);
        this.tone(o, "triangle", 1800, 1500, t + 0.05, 0.3, 0.25);
        break;
      case "pickup":
        this.burst(o, t, 0.2, 0.3, "lowpass", 600);
        this.tone(o, "sawtooth", 220, 110, t, 0.3, 0.12);
        break;
      case "pod":
        this.burst(o, t, 0.9, 0.4, "highpass", 2500, 0.7, 6000);
        this.tone(o, "sine", 220, 110, t, 0.9, 0.3);
        this.tone(o, "sine", 330, 165, t + 0.05, 0.9, 0.2);
        break;
      case "rescue":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(o, "triangle", f, f, t + i * 0.07, 0.25, 0.3));
        break;
      case "eliminated":
        this.tone(o, "sawtooth", 300, 50, t, 1.2, 0.35);
        this.burst(o, t, 1.0, 0.3, "lowpass", 2000, 1, 100);
        break;
      case "escape":
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(o, "square", f, f, t + i * 0.09, 0.3, 0.12));
        break;
      case "hacked":
        [880, 1175, 1568].forEach((f, i) => this.tone(o, "square", f, f, t + i * 0.08, 0.18, 0.15));
        break;
      case "alarm":
        for (let i = 0; i < 4; i++) this.tone(o, "square", 1400, 900, t + i * 0.18, 0.16, 0.25);
        break;
      case "exitsPowered":
        this.tone(o, "sawtooth", 55, 110, t, 1.6, 0.4);
        this.tone(o, "sawtooth", 82, 165, t, 1.6, 0.3);
        [440, 554, 659].forEach((f, i) => this.tone(o, "triangle", f, f, t + 0.6 + i * 0.12, 0.5, 0.25));
        break;
      case "exitOpen":
        this.burst(o, t, 1.4, 0.5, "lowpass", 200, 1, 1500);
        this.tone(o, "sawtooth", 60, 40, t, 1.4, 0.3);
        break;
      case "abilityHunter":
        this.tone(o, "sawtooth", 90, 45, t, 0.6, 0.45);
        this.burst(o, t, 0.5, 0.3, "bandpass", 300, 3, 1200);
        break;
      case "abilitySurvivor":
        this.tone(o, "sine", 660, 1320, t, 0.3, 0.35);
        this.tone(o, "triangle", 990, 1980, t + 0.06, 0.3, 0.2);
        break;
      case "struggle":
        this.burst(o, t, 0.06, 0.25, "bandpass", 700 + Math.random() * 500, 3);
        break;
      case "skill":
        this.tone(o, "square", 1500, 1500, t, 0.08, 0.2);
        this.tone(o, "square", 1500, 1500, t + 0.12, 0.08, 0.2);
        break;
      case "skillOk":
        this.tone(o, "triangle", 1046, 1568, t, 0.15, 0.3);
        break;
      case "skillFail":
        this.tone(o, "sawtooth", 220, 110, t, 0.4, 0.35);
        break;
      case "powerupGet":
        [784, 988, 1175].forEach((f, i) => this.tone(o, "sine", f, f * 1.01, t + i * 0.05, 0.2, 0.3));
        break;
      case "roundStart":
        this.tone(o, "sawtooth", 110, 55, t, 1.5, 0.35);
        this.burst(o, t, 1.2, 0.25, "bandpass", 120, 2, 600);
        break;
      case "roundEnd":
        [659, 523, 392, 330].forEach((f, i) => this.tone(o, "triangle", f, f, t + i * 0.15, 0.5, 0.25));
        break;
      case "click":
        this.tone(o, "triangle", 900, 700, t, 0.05, 0.15);
        break;
      case "hackTick":
        this.tone(o, "square", 2000 + Math.random() * 1500, 2000, t, 0.03, 0.04);
        break;
      case "pulse":
        this.tone(o, "sine", 62, 45, t, 0.22, 0.7);
        this.tone(o, "sine", 58, 42, t + 0.26, 0.2, 0.5);
        break;
      case "trap":
        this.burst(o, t, 0.15, 0.6, "highpass", 2000);
        this.tone(o, "square", 300, 150, t, 0.2, 0.3);
        break;
      case "recover":
        this.tone(o, "sine", 440, 660, t, 0.25, 0.25);
        break;
    }
  }

  /** Looping ambience per theme: low drone + filtered air + random machinery clicks. */
  ambient(theme: string | null) {
    if (!this.ctx || theme === this.ambTheme) return;
    for (const n of this.ambNodes) {
      try {
        (n as any).stop?.();
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.ambNodes = [];
    this.ambTheme = theme ?? "";
    if (!theme) return;
    const ctx = this.ctx;
    const base: Record<string, number> = { facility: 55, industrial: 41, school: 65, underground: 36, mall: 73, warehouse: 46 };
    const f = base[theme] ?? 50;
    const drone = ctx.createOscillator();
    drone.type = "sawtooth";
    drone.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160;
    const dg = ctx.createGain();
    dg.gain.value = 0.12;
    drone.connect(lp);
    lp.connect(dg);
    dg.connect(this.amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 60;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = theme === "underground" ? 300 : 700;
    bp.Q.value = 0.6;
    const ag = ctx.createGain();
    ag.gain.value = 0.05;
    air.connect(bp);
    bp.connect(ag);
    ag.connect(this.amb);
    drone.start();
    lfo.start();
    air.start();
    this.ambNodes.push(drone, lfo, air, dg, ag);
  }
}

export const audio = new Audio();
