// ============================================================================
// PIXELFORGE DYNAMICS - AUDIO ENGINE v1.0
// Web Audio API oscillator-based sound effects + simple background music.
// No external audio files required -- everything is synthesized at runtime.
// ============================================================================

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let currentMusic: OscillatorNode[] = [];

function ensureContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.25;
    musicGain.connect(masterGain);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(masterGain);
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Helper: play a short tone burst
function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'square',
  volumeEnvelope?: { attack: number; decay: number; sustain: number },
  detune: number = 0
): void {
  const ctx = ensureContext();
  if (!sfxGain) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;

  const now = ctx.currentTime;
  const env = volumeEnvelope || { attack: 0.01, decay: duration * 0.5, sustain: 0.3 };

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + env.attack);
  gain.gain.linearRampToValueAtTime(env.sustain, now + env.attack + env.decay);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(gain);
  gain.connect(sfxGain);

  osc.start(now);
  osc.stop(now + duration);
}

// Helper: play a frequency sweep
function playSweep(
  startFreq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType = 'square'
): void {
  const ctx = ensureContext();
  if (!sfxGain) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);

  gain.gain.setValueAtTime(0.8, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(sfxGain);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// ============================================================================
// PUBLIC SFX API
// ============================================================================

export function sfxJump(): void {
  playSweep(300, 600, 0.15, 'square');
}

export function sfxLand(): void {
  playTone(120, 0.1, 'triangle', { attack: 0.005, decay: 0.05, sustain: 0.1 });
}

export function sfxCoinPickup(): void {
  const ctx = ensureContext();
  if (!sfxGain) return;
  const now = ctx.currentTime;

  // Two-note coin chime (like Mario)
  [880, 1175].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.07);
    gain.gain.linearRampToValueAtTime(0.6, now + i * 0.07 + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + i * 0.07 + 0.15);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now + i * 0.07);
    osc.stop(now + i * 0.07 + 0.15);
  });
}

export function sfxStompKill(): void {
  playSweep(400, 80, 0.2, 'sawtooth');
  playTone(200, 0.08, 'square', { attack: 0.005, decay: 0.04, sustain: 0.2 });
}

export function sfxPlayerHurt(): void {
  playSweep(500, 150, 0.3, 'sawtooth');
  // Add noise-like wobble
  setTimeout(() => {
    playTone(180, 0.15, 'square', { attack: 0.01, decay: 0.08, sustain: 0.1 }, 50);
  }, 50);
}

export function sfxLevelComplete(): void {
  const ctx = ensureContext();
  if (!sfxGain) return;
  const now = ctx.currentTime;

  // Ascending fanfare: C E G C'
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const t = now + i * 0.12;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.1);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

export function sfxGameOver(): void {
  const ctx = ensureContext();
  if (!sfxGain) return;
  const now = ctx.currentTime;

  // Descending sad phrase: G E C low-G
  const notes = [392, 330, 262, 196];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = now + i * 0.2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + 0.4);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

export function sfxMysteryBlock(): void {
  playSweep(600, 1200, 0.12, 'square');
  setTimeout(() => playTone(1000, 0.08, 'square', { attack: 0.005, decay: 0.04, sustain: 0.3 }), 60);
}

export function sfxSpikeHit(): void {
  playSweep(800, 100, 0.25, 'sawtooth');
  playTone(150, 0.15, 'square', { attack: 0.005, decay: 0.08, sustain: 0.2 }, -25);
}

// ============================================================================
// BACKGROUND MUSIC - Simple looping arpeggios per biome
// ============================================================================

type Biome = 'underwater' | 'cave' | 'volcano';

const BIOME_SCALES: Record<Biome, number[]> = {
  underwater: [262, 330, 392, 494, 523, 659],    // C major pentatonic-ish (bright)
  cave:      [220, 262, 294, 349, 392, 440],     // A minor-ish (mysterious)
  volcano:   [247, 294, 330, 370, 440, 494],      // B phrygian-ish (tense)
};

export function startMusic(biome: Biome): void {
  stopMusic();
  const ctx = ensureContext();
  if (!musicGain) return;

  const scale = BIOME_SCALES[biome];
  const now = ctx.currentTime;

  // Bass drone
  const bass = ctx.createOscillator();
  const bassGain = ctx.createGain();
  bass.type = 'triangle';
  bass.frequency.value = scale[0] / 2; // One octave below root
  bassGain.gain.value = 0.15;
  bass.connect(bassGain);
  bassGain.connect(musicGain);
  bass.start(now);
  currentMusic.push(bass);

  // Arpeggio pattern (repeating LFO-modulated sequence)
  const arp = ctx.createOscillator();
  const arpGain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  arp.type = 'square';
  arpGain.gain.value = 0.08;

  // LFO modulates arpeggio frequency for movement
  lfo.type = 'sine';
  lfo.frequency.value = 0.5; // Slow sweep
  lfoGain.gain.value = scale[scale.length - 1] - scale[0]; // Range of scale

  lfo.connect(lfoGain);
  lfoGain.connect(arp.frequency);
  arp.frequency.value = scale[2]; // Start on third
  arp.connect(arpGain);
  arpGain.connect(musicGain);

  lfo.start(now);
  arp.start(now);
  currentMusic.push(arp, lfo);
}

export function stopMusic(): void {
  currentMusic.forEach(osc => {
    try { osc.stop(); } catch { /* already stopped */ }
  });
  currentMusic = [];
}

export function setMasterVolume(v: number): void {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

export function initAudio(): void {
  ensureContext();
}
