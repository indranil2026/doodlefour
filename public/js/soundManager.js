// public/js/soundManager.js
// Soothing musical Web Audio API sound synthesizer with zero external dependencies

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastBumpTime = 0;
    this.lastSqueezeTime = 0;
    this.lastStepTime = 0;
    this.stepCounter = 0;

    // Load mute preference if available
    try {
      this.muted = localStorage.getItem('doodle_muted') === 'true';
    } catch (e) {}
  }

  _init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('doodle_muted', this.muted);
    } catch (e) {}
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  /**
   * Sound 1: Soft running / rolling footstep tick (played while moving smoothly)
   */
  playRunningStep() {
    if (this.muted) return;
    this._init();
    if (!this.ctx) return;

    const now = performance.now();
    if (now - this.lastStepTime < 140) return;
    this.lastStepTime = now;
    this.stepCounter++;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Gentle soft kalimba tap
    const freq = (this.stepCounter % 2 === 0) ? 330 : 392; // E4 or G4
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.025, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * Sound 2: Soft wooden / bubble pop on obstacle touch (warm, organic, subtle)
   */
  playWallBump() {
    if (this.muted) return;
    this._init();
    if (!this.ctx) return;

    const now = performance.now();
    if (now - this.lastBumpTime < 140) return;
    this.lastBumpTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Warm organic pitch drop (bubble/wooden block pop)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.07);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  /**
   * Sound 3: Cute bouncy wobble / rubber boing spring sound when trying to squeeze through a narrow gap
   */
  playNarrowSqueeze() {
    if (this.muted) return;
    this._init();
    if (!this.ctx) return;

    const now = performance.now();
    if (now - this.lastSqueezeTime < 220) return;
    this.lastSqueezeTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Springy pitch rise and wobble: starting from low, ramping up then wobbling down
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(580, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);

    gain.gain.setValueAtTime(0.07, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  /**
   * Sound 4: Soothing acoustic bell-like countdown chimes (3.. 2.. 1.. GO!)
   */
  playCountdownBeep(countOrGo) {
    if (this.muted) return;
    this._init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    if (countOrGo === true || countOrGo === 'GO!' || countOrGo === 'GO') {
      // "GO!" - Bright, warm dual chime chord (C6 + E6)
      const goFreqs = [1046.50, 1318.51];
      goFreqs.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.45);
      });
    } else {
      // 3, 2, 1 - Gentle musical bell tone progressing pleasantly
      let noteFreq = 523.25; // C5 default
      if (countOrGo === 3 || countOrGo === '3') noteFreq = 523.25; // C5
      if (countOrGo === 2 || countOrGo === '2') noteFreq = 659.25; // E5
      if (countOrGo === 1 || countOrGo === '1') noteFreq = 783.99; // G5

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, t);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.28);
    }
  }

  /**
   * Sound 5: Victory fanfare / chime when touching the finish flag (Sweet C-major arpeggio)
   */
  playFinishChime() {
    if (this.muted) return;
    this._init();
    if (!this.ctx) return;

    const notes = [
      { f: 523.25, time: 0.00, dur: 0.15 }, // C5
      { f: 659.25, time: 0.10, dur: 0.15 }, // E5
      { f: 783.99, time: 0.20, dur: 0.18 }, // G5
      { f: 1046.50, time: 0.32, dur: 0.45 } // C6
    ];

    const t = this.ctx.currentTime;

    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, t + n.time);

      gain.gain.setValueAtTime(0, t + n.time);
      gain.gain.linearRampToValueAtTime(0.2, t + n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.time + n.dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + n.time);
      osc.stop(t + n.time + n.dur);
    });
  }
}

export const sound = new SoundManager();
