// Verde Bay — audio.js: all sound synthesized live with WebAudio (no audio
// files, no network). SFX are one-shot oscillators + a shared noise buffer;
// music is a looping ~104 BPM groove in A minor via a lookahead scheduler;
// engine and siren are persistent loops following game state. Every method is
// safe to call before init() and never throws, even with no audio device.
export const AudioSys = {
  musicOn: false,
  muted: false,
  // Internal state (not part of the public contract).
  _ctx: null,        // AudioContext, created lazily by init()
  _master: null,     // master gain (mute lives here)
  _sfxBus: null,     // SFX gain bus
  _musicBus: null,   // music gain bus
  _noiseBuf: null,   // shared white-noise buffer
  _musicTimer: null, // lookahead scheduler interval id
  _nextStep: 0,      // ctx-clock time of the next 16th step to schedule
  _step: 0,          // 16th-step counter (drives bar / melody position)
  _engine: null,     // { osc, filter, gain } or null
  _siren: null,      // { osc, lfo, gain } or null
  // ---- lifecycle ---------------------------------------------------------
  init() {
    try {
      if (this._ctx) return; // already initialised
      const AC = typeof AudioContext !== 'undefined' ? AudioContext
        : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
      if (!AC) return; // no WebAudio here: stay a silent no-op
      const ctx = new AC();
      this._ctx = ctx;
      this._master = ctx.createGain();
      this._master.gain.value = this.muted ? 0 : 1;
      this._master.connect(ctx.destination);
      this._sfxBus = ctx.createGain();
      this._sfxBus.gain.value = 0.9;
      this._sfxBus.connect(this._master);
      this._musicBus = ctx.createGain();
      this._musicBus.gain.value = 0.5;
      this._musicBus.connect(this._master);
      // One 1-second white-noise buffer, reused by every noise-based sound.
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      if (this.musicOn) this._startMusic();
    } catch (e) { /* never throw: audio is optional */ }
  },
  resume() {
    try {
      const ctx = this._ctx;
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* no-op */ }
  },
  // ---- mute / music switches ---------------------------------------------
  setMuted(muted) {
    try {
      this.muted = !!muted;
      if (this._master) {
        this._master.gain.setTargetAtTime(this.muted ? 0 : 1, this._ctx.currentTime, 0.02);
      }
    } catch (e) { /* no-op */ }
  },
  setMusic(on) {
    try {
      this.musicOn = !!on;
      if (!this._ctx) return; // music starts only after init()
      if (this.musicOn) this._startMusic();
      else this._stopMusic();
    } catch (e) { /* no-op */ }
  },
  // ---- one-shot SFX ------------------------------------------------------
  sfx(name) {
    try {
      if (!this._ctx || !this._noiseBuf) return;
      const t = this._ctx.currentTime;
      switch (name) {
        case 'click':      this._tone('square', 800, 520, 0.06, 0.18); break;
        case 'pickup':     this._seq([660, 990], 0.07, 0.12, 0.25, 'sine', t); break;
        case 'cash':       this._seq([1320, 1760], 0.06, 0.14, 0.22, 'sine', t); break;
        case 'shot':
          this._noise(0.14, 0.5, 'lowpass', 1800);
          this._tone('square', 190, 55, 0.10, 0.35); break;
        case 'punch':
          this._noise(0.08, 0.4, 'bandpass', 320);
          this._tone('sine', 130, 60, 0.09, 0.4); break;
        case 'crash':
          this._noise(0.35, 0.55, 'lowpass', 900);
          this._tone('sine', 90, 40, 0.3, 0.5); break;
        case 'explosion':
          this._noise(0.9, 0.7, 'lowpass', 500);
          this._tone('sine', 70, 28, 0.8, 0.6); break;
        case 'horn':
          this._tone('sawtooth', 370, 0, 0.32, 0.16, t);
          this._tone('sawtooth', 466, 0, 0.32, 0.16, t); break;
        case 'enterCar':
          this._tone('sine', 110, 55, 0.12, 0.35);
          this._tone('square', 700, 0, 0.04, 0.12, t + 0.1); break;
        case 'missionStart': this._seq([440, 523.25, 659.25], 0.09, 0.16, 0.28, 'triangle', t); break;
        case 'missionDone':  this._seq([440, 523.25, 659.25, 880], 0.1, 0.18, 0.28, 'triangle', t); break;
        case 'missionFail':  this._seq([440, 349.23, 329.63], 0.14, 0.22, 0.26, 'triangle', t); break;
        case 'wantedUp':     this._seq([880, 660, 880, 660], 0.11, 0.14, 0.16, 'square', t); break;
        case 'busted':
          this._tone('sawtooth', 220, 110, 0.5, 0.25);
          this._tone('sawtooth', 233, 116, 0.5, 0.2, t + 0.02); break;
        case 'wasted':       this._seq([392, 311.13, 261.63, 196], 0.28, 0.5, 0.3, 'triangle', t); break;
        case 'win':          this._seq([523.25, 659.25, 783.99, 1046.5], 0.12, 0.3, 0.3, 'triangle', t); break;
        case 'sirenBlip':
          this._tone('sine', 700, 950, 0.09, 0.2);
          this._tone('sine', 950, 700, 0.09, 0.2, t + 0.09); break;
        case 'ammo':
          this._noise(0.03, 0.3, 'highpass', 2500, t);
          this._noise(0.03, 0.3, 'highpass', 2500, t + 0.08);
          this._tone('square', 500, 300, 0.05, 0.15, t + 0.15); break;
        default: break; // unknown names are ignored silently
      }
    } catch (e) { /* no-op */ }
  },
  // ---- engine loop: call every frame with level 0..1 ---------------------
  engine(level) {
    try {
      if (!this._ctx) return;
      const t = this._ctx.currentTime;
      const lv = Math.max(0, Math.min(1, level || 0));
      if (lv <= 0) { // engine off / on foot: fade out, keep nodes for reuse
        if (this._engine) this._engine.gain.gain.setTargetAtTime(0, t, 0.08);
        return;
      }
      if (!this._engine) {
        const ctx = this._ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 50;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        filter.Q.value = 1.2;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter); filter.connect(gain); gain.connect(this._master);
        osc.start();
        this._engine = { osc, filter, gain };
      }
      // Smooth ramps only — no clicks when the level jumps.
      this._engine.osc.frequency.setTargetAtTime(42 + lv * 95, t, 0.06); // ~42-137 Hz
      this._engine.filter.frequency.setTargetAtTime(280 + lv * 700, t, 0.08);
      this._engine.gain.gain.setTargetAtTime(0.03 + lv * 0.09, t, 0.08);
    } catch (e) { /* no-op */ }
  },
  // ---- police siren loop -------------------------------------------------
  siren(on) {
    try {
      if (!this._ctx) return;
      const t = this._ctx.currentTime;
      if (on) {
        if (!this._siren) {
          const ctx = this._ctx;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 825; // midpoint of the two tones
          // Square LFO swings the tone between ~700 and ~950 Hz every 0.4 s.
          const lfo = ctx.createOscillator();
          lfo.type = 'square';
          lfo.frequency.value = 1.25; // 0.8 s period = 0.4 s per tone
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 125;
          lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
          const gain = ctx.createGain();
          gain.gain.value = 0;
          osc.connect(gain); gain.connect(this._master);
          osc.start(); lfo.start();
          this._siren = { osc, lfo, gain };
        }
        this._siren.gain.gain.setTargetAtTime(0.05, t, 0.1); // quiet under music/SFX
      } else if (this._siren) {
        this._siren.gain.gain.setTargetAtTime(0, t, 0.1);
      }
    } catch (e) { /* no-op */ }
  },
  // ---- low-level synth helpers -------------------------------------------
  // Short oscillator blip with an attack/decay envelope (SFX bus).
  _tone(type, freq, freqEnd, dur, vol, when) {
    const ctx = this._ctx;
    const t0 = when || ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this._sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },
  // A short run of evenly spaced notes (arpeggios, alerts).
  _seq(freqs, gap, dur, vol, type, t0) {
    freqs.forEach((f, i) => this._tone(type, f, 0, dur, vol, t0 + i * gap));
  },
  // Filtered burst from the shared noise buffer (SFX bus).
  _noise(dur, vol, filterType, freq, when) {
    const ctx = this._ctx;
    const t0 = when || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(this._sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  // ---- music: ~104 BPM groove in A minor, Am – F – C – G (one bar each).
  // Bass walks the roots with octave pops, hats tick the offbeats, a soft pad
  // holds each chord and a plucky lead plays a pentatonic phrase per bar.
  _startMusic() {
    if (this._musicTimer) return;
    this._step = 0;
    this._nextStep = this._ctx.currentTime + 0.1;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 100);
  },
  _stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  },
  _scheduleMusic() {
    try {
      if (!this._ctx || !this.musicOn) return;
      const stepDur = 60 / 104 / 4; // one 16th note at 104 BPM
      while (this._nextStep < this._ctx.currentTime + 0.2) {
        this._scheduleStep(this._step, this._nextStep, stepDur);
        this._step++;
        this._nextStep += stepDur;
      }
    } catch (e) { /* keep the scheduler alive */ }
  },
  _scheduleStep(step, t, stepDur) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const ROOTS = [110, 87.31, 130.81, 98]; // Am – F – C – G
    const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
    const root = ROOTS[bar % 4];
    // Bass: root on the beat, octave pop on the "and" of 2 and 4.
    if (s === 0 || s === 4 || s === 8 || s === 12) this._musicNote('triangle', root, t, stepDur * 1.8, 0.34);
    if (s === 6 || s === 14) this._musicNote('triangle', root * 2, t, stepDur * 0.9, 0.2);
    // Hat: filtered noise tick on every offbeat 8th.
    if (s % 4 === 2) this._musicHat(t);
    // Pad: soft chord at the top of each bar, held for the whole bar.
    if (s === 0) for (const f of CHORDS[bar % 4]) this._musicNote('sine', f, t, stepDur * 16, 0.05);
    // Lead pluck: one short pentatonic phrase per bar, rotating through 4.
    const LEAD = [
      [440, 0, 523.25, 0, 659.25, 0, 523.25, 0, 440, 0, 392, 0, 0, 0, 0, 0],
      [0, 0, 440, 0, 0, 523.25, 0, 0, 587.33, 0, 523.25, 0, 440, 0, 0, 0],
      [329.63, 0, 392, 0, 440, 0, 0, 523.25, 0, 440, 0, 392, 0, 0, 329.63, 0],
      [0, 523.25, 0, 659.25, 0, 0, 783.99, 0, 659.25, 0, 523.25, 0, 0, 440, 0, 0],
    ];
    const note = LEAD[bar % 4][s];
    if (note) this._musicNote('triangle', note, t, stepDur * 1.4, 0.12);
  },
  // A single music note on the music bus.
  _musicNote(type, freq, t, dur, vol) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this._musicBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  },
  // Short highpassed noise tick for the hat.
  _musicHat(t) {
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(filter); filter.connect(g); g.connect(this._musicBus);
    src.start(t); src.stop(t + 0.06);
  },
};
