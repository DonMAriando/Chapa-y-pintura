export class DerbyAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private p1Osc: OscillatorNode | null = null;
  private p1SubOsc: OscillatorNode | null = null;
  private p1EngineGain: GainNode | null = null;
  private p1Filter: BiquadFilterNode | null = null;

  private p2Osc: OscillatorNode | null = null;
  private p2EngineGain: GainNode | null = null;
  private p2Filter: BiquadFilterNode | null = null;

  private skidSource: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;

  private nitroSource: AudioBufferSourceNode | null = null;
  private nitroFilter: BiquadFilterNode | null = null;
  private nitroGain: GainNode | null = null;

  private crunchCurve: Float32Array<ArrayBuffer> | null = null;
  private ampCurve: Float32Array<ArrayBuffer> | null = null;

  // Heavy Metal Music Sequencer Bus
  private musicGain: GainNode | null = null;
  private guitarBus: GainNode | null = null;
  private leadEchoGain: GainNode | null = null;
  private musicTimerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private musicMode: 'off' | 'ambient' | 'battle' = 'off';

  private muted = false;
  private musicMuted = false;
  private initialized = false;
  private lastImpactTime = 0;
  private lastPartTime = 0;

  private createCrunchCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] =
        ((3 + amount) * x * 20 * (Math.PI / 180)) /
        (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private createTubeAmpCurve(drive: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Asymmetric tube clipping for rich even+odd metal harmonics
      const shifted = x + 0.08;
      curve[i] = Math.tanh(shifted * drive) - Math.tanh(0.08 * drive);
    }
    return curve;
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.54;
      master.connect(ctx.destination);
      this.masterGain = master;

      this.crunchCurve = this.createCrunchCurve(38);
      this.ampCurve = this.createTubeAmpCurve(6.5);

      // Shared 2-second white noise buffer
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, sampleRate * 2, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;

      // Setup Heavy Metal Music Amp + Cab + Mix Bus
      const musicGain = ctx.createGain();
      musicGain.gain.value = this.musicMuted ? 0 : 0.34;
      musicGain.connect(master);
      this.musicGain = musicGain;

      const guitarBus = ctx.createGain();
      guitarBus.gain.value = 0.85;
      const ampShaper = ctx.createWaveShaper();
      ampShaper.curve = this.ampCurve;
      ampShaper.oversample = '2x';

      const cabHp = ctx.createBiquadFilter();
      cabHp.type = 'highpass';
      cabHp.frequency.value = 95;

      const cabMid = ctx.createBiquadFilter();
      cabMid.type = 'peaking';
      cabMid.frequency.value = 1150;
      cabMid.Q.value = 1.1;
      cabMid.gain.value = 4.5;

      const cabLp = ctx.createBiquadFilter();
      cabLp.type = 'lowpass';
      cabLp.frequency.value = 2750;
      cabLp.Q.value = 0.85;

      guitarBus.connect(ampShaper);
      ampShaper.connect(cabHp);
      cabHp.connect(cabMid);
      cabMid.connect(cabLp);
      cabLp.connect(musicGain);
      this.guitarBus = guitarBus;

      // Subtle arena delay for lead guitar harmonics
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.205;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.24;
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 1900;
      const echoSend = ctx.createGain();
      echoSend.gain.value = 0.28;

      echoSend.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delay);
      delayFilter.connect(musicGain);
      this.leadEchoGain = echoSend;

      // Player 1 V8 engine synth
      this.p1Osc = ctx.createOscillator();
      this.p1Osc.type = 'sawtooth';
      this.p1Osc.frequency.value = 48;

      this.p1SubOsc = ctx.createOscillator();
      this.p1SubOsc.type = 'triangle';
      this.p1SubOsc.frequency.value = 24;

      this.p1Filter = ctx.createBiquadFilter();
      this.p1Filter.type = 'lowpass';
      this.p1Filter.frequency.value = 220;
      this.p1Filter.Q.value = 2.4;

      this.p1EngineGain = ctx.createGain();
      this.p1EngineGain.gain.value = 0;

      this.p1Osc.connect(this.p1Filter);
      this.p1SubOsc.connect(this.p1Filter);
      this.p1Filter.connect(this.p1EngineGain);
      this.p1EngineGain.connect(master);

      this.p1Osc.start();
      this.p1SubOsc.start();

      // Player 2 engine synth
      this.p2Osc = ctx.createOscillator();
      this.p2Osc.type = 'sawtooth';
      this.p2Osc.frequency.value = 52;

      this.p2Filter = ctx.createBiquadFilter();
      this.p2Filter.type = 'lowpass';
      this.p2Filter.frequency.value = 220;
      this.p2Filter.Q.value = 2.2;

      this.p2EngineGain = ctx.createGain();
      this.p2EngineGain.gain.value = 0;

      this.p2Osc.connect(this.p2Filter);
      this.p2Filter.connect(this.p2EngineGain);
      this.p2EngineGain.connect(master);
      this.p2Osc.start();

      // Dirt drift / tire skid loop
      this.skidSource = ctx.createBufferSource();
      this.skidSource.buffer = buffer;
      this.skidSource.loop = true;

      this.skidFilter = ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.value = 720;
      this.skidFilter.Q.value = 1.6;

      this.skidGain = ctx.createGain();
      this.skidGain.gain.value = 0;

      this.skidSource.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(master);
      this.skidSource.start();

      // Nitro jet / turbine loop
      this.nitroSource = ctx.createBufferSource();
      this.nitroSource.buffer = buffer;
      this.nitroSource.loop = true;

      this.nitroFilter = ctx.createBiquadFilter();
      this.nitroFilter.type = 'bandpass';
      this.nitroFilter.frequency.value = 1350;
      this.nitroFilter.Q.value = 0.9;

      this.nitroGain = ctx.createGain();
      this.nitroGain.gain.value = 0;

      this.nitroSource.connect(this.nitroFilter);
      this.nitroFilter.connect(this.nitroGain);
      this.nitroGain.connect(master);
      this.nitroSource.start();

      this.initialized = true;
      this.startMusicLoop();
    } catch {
      // Ignore Web Audio errors on restricted contexts
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.54,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.applyMusicVolume();
  }

  public setMusicMode(mode: 'off' | 'ambient' | 'battle'): void {
    this.musicMode = mode;
    this.applyMusicVolume();
  }

  private applyMusicVolume(): void {
    if (!this.musicGain || !this.ctx) return;
    const target =
      this.musicMuted || this.musicMode === 'off'
        ? 0
        : this.musicMode === 'battle'
          ? 0.36
          : 0.16;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  private startMusicLoop(): void {
    if (this.musicTimerId !== null || !this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.currentStep = 0;
    this.applyMusicVolume();

    this.musicTimerId = window.setInterval(() => {
      this.scheduleMetalSteps();
    }, 25);
  }

  private scheduleMetalSteps(): void {
    if (!this.ctx || !this.initialized) return;
    if (this.ctx.state !== 'running') return;
    if (this.muted || this.musicMuted || this.musicMode === 'off') {
      this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.05);
      return;
    }

    const stepSec = 60 / 148 / 4; // 148 BPM 16th-note thrash/arena metal groove
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.triggerMetalStep(this.currentStep, this.nextNoteTime, stepSec);
      this.nextNoteTime += stepSec;
      this.currentStep = (this.currentStep + 1) % 128;
    }
  }

  private playPowerChord(
    time: number,
    rootFreq: number,
    duration: number,
    palmMuted: boolean,
    volume: number,
  ): void {
    if (!this.ctx || !this.guitarBus) return;
    const ctx = this.ctx;

    const oscRoot = ctx.createOscillator();
    oscRoot.type = 'sawtooth';
    oscRoot.frequency.setValueAtTime(rootFreq, time);

    const oscFifth = ctx.createOscillator();
    oscFifth.type = 'sawtooth';
    oscFifth.frequency.setValueAtTime(rootFreq * 1.498, time);
    oscFifth.detune.value = 6;

    const oscOct = ctx.createOscillator();
    oscOct.type = 'sawtooth';
    oscOct.frequency.setValueAtTime(rootFreq * 2, time);
    oscOct.detune.value = -6;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    if (palmMuted) {
      filter.frequency.setValueAtTime(1650, time);
      filter.frequency.exponentialRampToValueAtTime(360, time + duration);
    } else {
      filter.frequency.setValueAtTime(3200, time);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(volume, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    oscRoot.connect(filter);
    oscFifth.connect(filter);
    oscOct.connect(filter);
    filter.connect(env);
    env.connect(this.guitarBus);

    oscRoot.start(time);
    oscFifth.start(time);
    oscOct.start(time);
    oscRoot.stop(time + duration + 0.015);
    oscFifth.stop(time + duration + 0.015);
    oscOct.stop(time + duration + 0.015);
  }

  private playMetalBass(
    time: number,
    freq: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(460, time);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(volume, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(lp);
    lp.connect(env);
    env.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.015);
  }

  private playMetalLead(
    time: number,
    freq: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.ctx || !this.guitarBus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    // Expressive vibrato on longer notes
    if (duration > 0.22) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 6.2;
      lfoGain.gain.value = freq * 0.015;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(time + 0.06);
      lfo.stop(time + duration + 0.01);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(volume, time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(env);
    env.connect(this.guitarBus);
    if (this.leadEchoGain) {
      env.connect(this.leadEchoGain);
    }
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private playKick(time: number, volume: number): void {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.065);

    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

    osc.connect(env);
    env.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.12);

    // Beater click transient so double-kick cuts through distorted guitars
    if (this.noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 1.8;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(volume * 0.34, time);
      cg.gain.exponentialRampToValueAtTime(0.001, time + 0.022);
      click.connect(bp);
      bp.connect(cg);
      cg.connect(this.musicGain);
      click.start(time, Math.random() * 0.5, 0.03);
    }
  }

  private playSnare(time: number, volume: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(195, time);
    body.frequency.exponentialRampToValueAtTime(112, time + 0.075);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(volume * 0.72, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
    body.connect(bodyGain);
    bodyGain.connect(this.musicGain);
    body.start(time);
    body.stop(time + 0.12);

    const wires = ctx.createBufferSource();
    wires.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1350;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(volume * 0.85, time);
    wg.gain.exponentialRampToValueAtTime(0.001, time + 0.145);
    wires.connect(hp);
    hp.connect(wg);
    wg.connect(this.musicGain);
    wires.start(time, Math.random() * 0.6, 0.16);
  }

  private playCymbal(time: number, isCrash: boolean, volume: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = isCrash ? 3800 : 6200;

    const dur = isCrash ? 0.58 : 0.075;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);

    src.connect(hp);
    hp.connect(env);
    env.connect(this.musicGain);
    src.start(time, Math.random() * 0.5, dur + 0.02);
  }

  private triggerMetalStep(step: number, time: number, stepSec: number): void {
    const bar = Math.floor(step / 16); // 0..7
    const sub = step % 16; // 0..15

    // Note frequencies (E standard metal tuning)
    const E2 = 82.41;
    const F2 = 87.31;
    const Fs2 = 92.5;
    const G2 = 98.0;
    const A2 = 110.0;
    const Bb2 = 116.54;
    const B2 = 123.47;
    const C3 = 130.81;
    const D3 = 146.83;

    // 1. Drums: Driving Thrash Beat (Bars 0-3) & Double-Kick Stadium Chorus (Bars 4-7)
    const isChorus = bar >= 4;
    const isTurnaround = bar === 3 || bar === 7;

    if (sub === 0 && (bar === 0 || bar === 4 || bar === 6)) {
      this.playCymbal(time, true, 0.28);
    } else if (sub % 2 === 0) {
      this.playCymbal(time, false, sub % 4 === 0 ? 0.12 : 0.075);
    }

    // Snare on 2 & 4 (steps 4 and 12), plus aggressive fill at end of bar 3 & 7
    if (isTurnaround && sub >= 12) {
      this.playSnare(time, sub % 2 === 0 ? 0.42 : 0.31);
    } else if (sub === 4 || sub === 12) {
      this.playSnare(time, 0.44);
    }

    // Kick pattern: galloping thrash in verse, relentless double-kick 16ths in chorus
    if (isChorus) {
      if (sub % 2 === 0 || sub === 3 || sub === 7 || sub === 11 || sub === 15) {
        this.playKick(time, sub % 4 === 0 ? 0.52 : 0.36);
      }
    } else {
      if (
        sub === 0 ||
        sub === 2 ||
        sub === 3 ||
        sub === 6 ||
        sub === 8 ||
        sub === 10 ||
        sub === 11 ||
        sub === 14
      ) {
        this.playKick(time, sub % 4 === 0 ? 0.52 : 0.4);
      }
    }

    // 2. Distorted Rhythm Guitar & Bass Riffs
    if (!isChorus) {
      // Verse Riff (Bars 0..3): E Phrygian / Minor palm-muted thrash gallop
      if (sub === 0) {
        this.playPowerChord(time, E2, stepSec * 2.1, false, 0.36);
        this.playMetalBass(time, E2 * 0.5, stepSec * 2.0, 0.36);
      } else if (sub === 2 || sub === 3 || sub === 6 || sub === 7 || sub === 10 || sub === 11) {
        this.playPowerChord(time, E2, stepSec * 0.85, true, 0.26);
        this.playMetalBass(time, E2 * 0.5, stepSec * 0.85, 0.28);
      } else if (bar === 0 && sub === 12) {
        this.playPowerChord(time, G2, stepSec * 3.2, false, 0.34);
        this.playMetalBass(time, G2 * 0.5, stepSec * 3.0, 0.34);
      } else if (bar === 1 && sub === 12) {
        this.playPowerChord(time, Bb2, stepSec * 1.8, false, 0.34);
        this.playMetalBass(time, Bb2 * 0.5, stepSec * 1.8, 0.32);
      } else if (bar === 1 && sub === 14) {
        this.playPowerChord(time, A2, stepSec * 1.8, false, 0.33);
        this.playMetalBass(time, A2 * 0.5, stepSec * 1.8, 0.32);
      } else if (bar === 2 && sub === 12) {
        this.playPowerChord(time, F2, stepSec * 3.2, false, 0.35);
        this.playMetalBass(time, F2 * 0.5, stepSec * 3.0, 0.34);
      } else if (bar === 3 && sub === 8) {
        this.playPowerChord(time, G2, stepSec * 1.8, false, 0.34);
        this.playMetalBass(time, G2 * 0.5, stepSec * 1.8, 0.34);
      } else if (bar === 3 && sub === 12) {
        this.playPowerChord(time, Fs2, stepSec * 1.8, false, 0.34);
        this.playMetalBass(time, Fs2 * 0.5, stepSec * 1.8, 0.34);
      } else if (bar === 3 && sub === 14) {
        this.playPowerChord(time, F2, stepSec * 1.8, false, 0.35);
        this.playMetalBass(time, F2 * 0.5, stepSec * 1.8, 0.34);
      }
    } else {
      // Chorus Stadium Power Chords (Bars 4..7): E5 -> C5 -> D5 -> B5/D5
      const chordRoots = [E2, C3, D3, B2];
      const root = chordRoots[bar - 4];

      if (sub === 0) {
        this.playPowerChord(time, root, stepSec * 7.5, false, 0.38);
        this.playMetalBass(time, root * 0.5, stepSec * 3.8, 0.38);
      } else if (sub === 8) {
        const secondRoot = bar === 7 ? D3 : root;
        this.playPowerChord(time, secondRoot, stepSec * 7.2, false, 0.36);
        this.playMetalBass(time, secondRoot * 0.5, stepSec * 3.8, 0.36);
      } else if (sub % 2 === 0) {
        // Bass drives 8ths under ringing power chords
        const bassRoot = bar === 7 && sub >= 8 ? D3 : root;
        this.playMetalBass(time, bassRoot * 0.5, stepSec * 1.7, 0.28);
      }

      // Anthemic High-Gain Lead Guitar Melody (in E minor)
      const leadNotes: Record<number, { freq: number; len: number }> = {
        // Bar 4 (E5)
        64: { freq: 329.63, len: 4 }, // E4
        68: { freq: 392.0, len: 4 }, // G4
        72: { freq: 440.0, len: 4 }, // A4
        76: { freq: 493.88, len: 4 }, // B4
        // Bar 5 (C5)
        80: { freq: 523.25, len: 6 }, // C5
        86: { freq: 493.88, len: 2 }, // B4
        88: { freq: 440.0, len: 4 }, // A4
        92: { freq: 392.0, len: 4 }, // G4
        // Bar 6 (D5)
        96: { freq: 587.33, len: 6 }, // D5
        102: { freq: 523.25, len: 2 }, // C5
        104: { freq: 493.88, len: 4 }, // B4
        108: { freq: 440.0, len: 4 }, // A4
        // Bar 7 (B5 -> D5)
        112: { freq: 493.88, len: 6 }, // B4
        118: { freq: 440.0, len: 2 }, // A4
        120: { freq: 587.33, len: 4 }, // D5
        124: { freq: 659.25, len: 4 }, // E5
      };

      const lead = leadNotes[step];
      if (lead) {
        this.playMetalLead(time, lead.freq, stepSec * lead.len * 0.95, 0.16);
      }
    }
  }

  public updateContinuous(params: {
    active: boolean;
    p1SpeedRatio: number;
    p1Alive: boolean;
    p1Boosting: boolean;
    p2SpeedRatio: number | null;
    p2Alive: boolean;
    p2Boosting: boolean;
    skidIntensity: number;
  }): void {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (!params.active) {
      this.p1EngineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.p2EngineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.skidGain?.gain.setTargetAtTime(0, now, 0.06);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    if (this.p1Osc && this.p1SubOsc && this.p1Filter && this.p1EngineGain) {
      if (params.p1Alive) {
        const rpmFreq =
          44 + params.p1SpeedRatio * 86 + (params.p1Boosting ? 28 : 0);
        this.p1Osc.frequency.setTargetAtTime(rpmFreq, now, 0.05);
        this.p1SubOsc.frequency.setTargetAtTime(rpmFreq * 0.5, now, 0.05);
        this.p1Filter.frequency.setTargetAtTime(
          200 + params.p1SpeedRatio * 680 + (params.p1Boosting ? 350 : 0),
          now,
          0.06,
        );
        this.p1EngineGain.gain.setTargetAtTime(
          0.065 + params.p1SpeedRatio * 0.05,
          now,
          0.06,
        );
      } else {
        this.p1EngineGain.gain.setTargetAtTime(0, now, 0.12);
      }
    }

    if (this.p2Osc && this.p2Filter && this.p2EngineGain) {
      if (params.p2SpeedRatio !== null && params.p2Alive) {
        const rpmFreq =
          49 + params.p2SpeedRatio * 84 + (params.p2Boosting ? 26 : 0);
        this.p2Osc.frequency.setTargetAtTime(rpmFreq, now, 0.05);
        this.p2Filter.frequency.setTargetAtTime(
          210 + params.p2SpeedRatio * 640,
          now,
          0.06,
        );
        this.p2EngineGain.gain.setTargetAtTime(
          0.05 + params.p2SpeedRatio * 0.04,
          now,
          0.06,
        );
      } else {
        this.p2EngineGain.gain.setTargetAtTime(0, now, 0.1);
      }
    }

    if (this.skidGain && this.skidFilter) {
      const clampedSkid = Math.min(1, Math.max(0, params.skidIntensity));
      this.skidGain.gain.setTargetAtTime(clampedSkid * 0.11, now, 0.04);
      this.skidFilter.frequency.setTargetAtTime(
        520 + clampedSkid * 560,
        now,
        0.05,
      );
    }

    if (this.nitroGain && this.nitroFilter) {
      const anyBoost =
        (params.p1Alive && params.p1Boosting) ||
        (params.p2Alive && params.p2Boosting);
      this.nitroGain.gain.setTargetAtTime(anyBoost ? 0.15 : 0, now, 0.04);
      this.nitroFilter.frequency.setTargetAtTime(
        anyBoost ? 1650 : 900,
        now,
        0.06,
      );
    }
  }

  // Synthesize an inharmonic FM steel-plate clang/ring at a specific start time
  private triggerFmMetalClang(
    startTime: number,
    baseFreq: number,
    modRatio: number,
    duration: number,
    volume: number,
    qFactor = 4.5,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const carrier = ctx.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(baseFreq, startTime);
    carrier.frequency.exponentialRampToValueAtTime(
      Math.max(45, baseFreq * 0.72),
      startTime + duration,
    );

    const mod = ctx.createOscillator();
    mod.type = 'sawtooth';
    mod.frequency.setValueAtTime(baseFreq * modRatio, startTime);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(baseFreq * 2.8, startTime);
    modGain.gain.exponentialRampToValueAtTime(12, startTime + duration * 0.65);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(baseFreq * 1.45, startTime);
    bp.Q.value = qFactor;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, startTime);
    env.gain.linearRampToValueAtTime(volume, startTime + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(bp);
    bp.connect(env);
    env.connect(this.masterGain);

    carrier.start(startTime);
    mod.start(startTime);
    carrier.stop(startTime + duration + 0.02);
    mod.stop(startTime + duration + 0.02);
  }

  // Synthesize gritty distorted sheet-metal buckling noise burst
  private triggerMetalCrumpleBurst(
    startTime: number,
    centerFreq: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(centerFreq, startTime);
    bp.frequency.exponentialRampToValueAtTime(
      Math.max(260, centerFreq * 0.45),
      startTime + duration,
    );
    bp.Q.value = 2.4;

    const shaper = ctx.createWaveShaper();
    if (this.crunchCurve) {
      shaper.curve = this.crunchCurve;
      shaper.oversample = '2x';
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, startTime);
    env.gain.linearRampToValueAtTime(volume, startTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    src.connect(bp);
    bp.connect(shaper);
    shaper.connect(env);
    env.connect(this.masterGain);

    src.start(startTime, Math.random() * 0.9, duration + 0.02);
  }

  public playImpact(strength: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || !this.noiseBuffer) {
      return;
    }
    const now = this.ctx.currentTime;
    if (now - this.lastImpactTime < 0.05) return;
    this.lastImpactTime = now;

    const norm = Math.min(1, Math.max(0.14, strength));

    // 1. Heavy chassis thud
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(98 + norm * 42, now);
    thump.frequency.exponentialRampToValueAtTime(26, now + 0.16 + norm * 0.09);
    thumpGain.gain.setValueAtTime(0.42 * norm, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22 + norm * 0.1);
    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.34);

    // 2. Multi-stage sheet-metal crumple crackles
    const crunchStages = norm > 0.6 ? 4 : 2;
    for (let i = 0; i < crunchStages; i++) {
      const delay = i === 0 ? 0 : 0.018 + i * 0.028 + Math.random() * 0.018;
      const freq = 1100 + Math.random() * 1900;
      const dur = 0.075 + norm * 0.11;
      const vol = (0.28 - i * 0.045) * norm;
      this.triggerMetalCrumpleBurst(now + delay, freq, dur, Math.max(0.04, vol));
    }

    // 3. Inharmonic FM steel clangs
    const baseMetal = 210 + Math.random() * 140;
    this.triggerFmMetalClang(now, baseMetal, 1.47, 0.22 + norm * 0.2, 0.26 * norm, 4.2);
    this.triggerFmMetalClang(
      now + 0.008,
      baseMetal * 2.13,
      1.73,
      0.16 + norm * 0.16,
      0.18 * norm,
      5.8,
    );

    // 4. High metallic scrap pings on brutal hits
    if (norm > 0.45) {
      const pingCount = norm > 0.72 ? 3 : 2;
      for (let i = 0; i < pingCount; i++) {
        const delay = 0.03 + i * 0.042 + Math.random() * 0.025;
        this.triggerFmMetalClang(
          now + delay,
          1450 + Math.random() * 1500,
          1.41,
          0.09 + Math.random() * 0.08,
          0.11 * norm,
          7.5,
        );
      }
    }
  }

  public playPartDetach(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPartTime < 0.09) return;
    this.lastPartTime = now;

    this.triggerMetalCrumpleBurst(now, 2400, 0.09, 0.18);
    this.triggerFmMetalClang(now + 0.01, 480 + Math.random() * 240, 1.58, 0.24, 0.17, 5.2);
    this.triggerFmMetalClang(now + 0.12, 690 + Math.random() * 320, 1.37, 0.16, 0.11, 6.0);
    this.triggerFmMetalClang(now + 0.22, 860 + Math.random() * 260, 1.63, 0.11, 0.07, 6.5);
  }

  public playWreckExplosion(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || !this.noiseBuffer) {
      return;
    }
    const now = this.ctx.currentTime;

    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(92, now);
    boom.frequency.exponentialRampToValueAtTime(20, now + 0.65);
    boomGain.gain.setValueAtTime(0.52, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start(now);
    boom.stop(now + 0.74);

    const blast = this.ctx.createBufferSource();
    blast.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now);
    lp.frequency.exponentialRampToValueAtTime(190, now + 0.7);
    const shaper = this.ctx.createWaveShaper();
    if (this.crunchCurve) {
      shaper.curve = this.crunchCurve;
    }
    const blastGain = this.ctx.createGain();
    blastGain.gain.setValueAtTime(0.42, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    blast.connect(lp);
    lp.connect(shaper);
    shaper.connect(blastGain);
    blastGain.connect(this.masterGain);
    blast.start(now, 0, 0.8);

    const scrapDelays = [0.02, 0.07, 0.14, 0.21, 0.29, 0.38];
    for (let i = 0; i < scrapDelays.length; i++) {
      const t = now + scrapDelays[i] + Math.random() * 0.025;
      const pitch = 240 + i * 165 + Math.random() * 220;
      const vol = 0.26 - i * 0.03;
      this.triggerFmMetalClang(t, pitch, 1.47 + (i % 3) * 0.19, 0.28 - i * 0.02, vol, 5.0);
      if (i % 2 === 0) {
        this.triggerMetalCrumpleBurst(t, 1400 + i * 280, 0.12, 0.18 - i * 0.02);
      }
    }
  }

  public playPickup(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playCountdownTone(go: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = go ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(go ? 784 : 523.25, now);
    gain.gain.setValueAtTime(go ? 0.22 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (go ? 0.38 : 0.18));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (go ? 0.4 : 0.2));
  }

  public dispose(): void {
    if (this.musicTimerId !== null) {
      clearInterval(this.musicTimerId);
      this.musicTimerId = null;
    }
    try {
      this.p1Osc?.stop();
      this.p1SubOsc?.stop();
      this.p2Osc?.stop();
      this.skidSource?.stop();
      this.nitroSource?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
  }
}
