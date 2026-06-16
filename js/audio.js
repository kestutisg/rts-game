/**
 * Procedural Web Audio Synth Looper for Tiberian Odyssey
 * Synthesizes an industrial C&C-style ambient loop (kick, hi-hat, and sweeping synth bassline)
 * entirely in the browser using raw Web Audio API nodes.
 */

export class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    
    // Sequencer state
    this.timerId = null;
    this.tempo = 112; // BPM
    this.stepDuration = 60 / this.tempo / 4; // 16th note duration (seconds)
    this.nextNoteTime = 0;
    this.currentStep = 0;

    // Generated noise buffer for hi-hats
    this.noiseBuffer = null;

    // Bass notes sequence (frequencies in Hz)
    // C2 (65.4Hz), Eb2 (77.8Hz), F2 (87.3Hz), Bb1 (58.2Hz)
    this.bassPattern = [
      65.4, 0, 65.4, 0,
      65.4, 0, 77.8, 0,
      87.3, 0, 87.3, 0,
      87.3, 0, 58.2, 87.3
    ];
  }

  initContext() {
    if (this.ctx) return;
    
    // Create audio context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Create White Noise buffer for hi-hat sweeps
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const channelData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }
  }

  start() {
    this.initContext();
    
    if (this.isPlaying) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;

    // Run the scheduler tick loop
    this.schedulerLoop();
  }

  stop() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    clearTimeout(this.timerId);
    this.timerId = null;
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  schedulerLoop() {
    if (!this.isPlaying) return;

    // Schedule any notes that fall within the next 100ms
    const scheduleAheadTime = 0.1;
    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }

    // Call this loop again in 30ms
    this.timerId = setTimeout(() => this.schedulerLoop(), 30);
  }

  advanceStep() {
    this.nextNoteTime += this.stepDuration;
    this.currentStep = (this.currentStep + 1) % 16;
  }

  scheduleStep(step, time) {
    // 1. Kick drum: beats 1, 5, 9, 13 (steps 0, 4, 8, 12)
    if (step % 4 === 0) {
      this.triggerKick(time);
    }

    // 2. Hi-hat noise click: off-beats (steps 2, 6, 10, 14)
    if (step % 4 === 2) {
      this.triggerHiHat(time);
    } else if (step % 4 === 0 && Math.random() < 0.3) {
      // Small ghost hats for texture
      this.triggerHiHat(time, 0.015);
    }

    // 3. Bass synth note (low-pass sweep oscillator)
    const freq = this.bassPattern[step];
    if (freq > 0) {
      this.triggerBass(freq, time);
    }
  }

  triggerKick(time) {
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    // Fast pitch sweep for standard analog kick drum thump
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12);

    // Amplitude decay envelope
    gainNode.gain.setValueAtTime(0.35, time);
    gainNode.gain.linearRampToValueAtTime(0.001, time + 0.15);

    osc.start(time);
    osc.stop(time + 0.16);
  }

  triggerHiHat(time, volume = 0.03) {
    if (!this.noiseBuffer) return;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    // Highpass filter for hi-hat frequencies
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gainNode = this.ctx.createGain();

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    gainNode.gain.setValueAtTime(volume, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    noiseSource.start(time);
    noiseSource.stop(time + 0.07);
  }

  triggerBass(freq, time) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';

    // Sub oscillator for bass beefiness
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq / 2, time);

    // Filter sweep (Acid filter)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    // Slow sweeping envelope: starts open then filters down
    const nowSec = Date.now() / 1000;
    const sweepLfo = Math.sin(nowSec / 10) * 200 + 400; // Modulate peak frequency over time
    
    filter.frequency.setValueAtTime(sweepLfo, time);
    filter.frequency.exponentialRampToValueAtTime(120, time + 0.22);
    filter.Q.setValueAtTime(4.0, time); // Add resonant peak

    const gainNode = this.ctx.createGain();

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    // Modulate pitch slightly for detune texture
    osc.frequency.setValueAtTime(freq - 1.5, time);
    osc.frequency.linearRampToValueAtTime(freq, time + 0.2);

    // Gain envelope
    gainNode.gain.setValueAtTime(0.12, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + 0.26);
    subOsc.stop(time + 0.26);
  }
}
