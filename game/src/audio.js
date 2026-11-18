// Star Harvest sound: every effect is synthesised with WebAudio — short
// oscillator blips with envelopes, a filtered noise burst for impacts, and a
// gentle looping arpeggio for the night ambience. There are no audio files.
// The context is created lazily on the first user gesture (unlock), so the
// game is silent until the player first presses a key or clicks, as browsers
// require. M mutes; the choice is remembered in localStorage.
import { MUTE_KEY } from './config.js';

/** A soft pentatonic ladder for the ambient arpeggio (A minor), in hertz. */
const LADDER = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
/** The arpeggio's shape: indexes into LADDER, one note per step, looping. */
const PATTERN = [0, 2, 4, 7, 5, 4, 2, 1, 0, 2, 4, 6, 7, 6, 4, 2];
const STEP_SECONDS = 0.34;

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Storage can be off: the mute then lasts this visit only.
  }
}

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = readMuted();
  let ambientTimer = null;
  let ambientStep = 0;
  let nextNoteAt = 0;

  /** Create (or resume) the context. Safe to call on every gesture. */
  function unlock() {
    if (context === null) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') context.resume();
  }

  /** One enveloped tone. `slide` glides the frequency to a second value. */
  function tone({ type = 'sine', from, to = null, at = 0, dur = 0.15, gain = 0.15 }) {
    if (context === null || muted) return;
    const start = context.currentTime + at;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** A short burst of filtered noise, for impacts and explosions. */
  function noise({ at = 0, dur = 0.25, gain = 0.25, freq = 800 }) {
    if (context === null || muted) return;
    const start = context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, start);
    filter.frequency.exponentialRampToValueAtTime(120, start + dur);
    const env = context.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter).connect(env).connect(master);
    source.start(start);
    source.stop(start + dur + 0.05);
  }

  /** One ambient note, scheduled ahead of time by the arpeggio's clock. */
  function ambientNote(when, stepIndex) {
    const note = LADDER[PATTERN[stepIndex % PATTERN.length]];
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = 'triangle';
    osc.frequency.value = note;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.045, when + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, when + STEP_SECONDS * 2.4);
    osc.connect(env).connect(master);
    osc.start(when);
    osc.stop(when + STEP_SECONDS * 2.6);
    if (stepIndex % 8 === 0) {
      const bass = context.createOscillator();
      const bassEnv = context.createGain();
      bass.type = 'sine';
      bass.frequency.value = stepIndex % 16 === 0 ? 110.0 : 82.41;
      bassEnv.gain.setValueAtTime(0, when);
      bassEnv.gain.linearRampToValueAtTime(0.05, when + 0.05);
      bassEnv.gain.exponentialRampToValueAtTime(0.0001, when + STEP_SECONDS * 7);
      bass.connect(bassEnv).connect(master);
      bass.start(when);
      bass.stop(when + STEP_SECONDS * 7.2);
    }
  }

  /** Keep the arpeggio scheduled a little ahead while it is switched on. */
  function pumpAmbient() {
    if (context === null) return;
    while (nextNoteAt < context.currentTime + 0.45) {
      if (!muted) ambientNote(nextNoteAt, ambientStep);
      ambientStep += 1;
      nextNoteAt += STEP_SECONDS;
    }
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      saveMuted(muted);
      if (master !== null) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
    setAmbient(on) {
      if (on && ambientTimer === null && context !== null) {
        ambientStep = 0;
        nextNoteAt = context.currentTime + 0.06;
        ambientTimer = window.setInterval(pumpAmbient, 160);
        pumpAmbient();
      } else if (!on && ambientTimer !== null) {
        window.clearInterval(ambientTimer);
        ambientTimer = null;
      }
    },
    click() {
      tone({ type: 'triangle', from: 880, dur: 0.06, gain: 0.08 });
    },
    collect(chain) {
      const lift = 1 + Math.min(chain, 12) * 0.045;
      tone({ type: 'sine', from: 659 * lift, to: 988 * lift, dur: 0.13, gain: 0.16 });
      tone({ type: 'triangle', from: 1318 * lift, at: 0.03, dur: 0.1, gain: 0.06 });
    },
    power(kind) {
      if (kind === 'shield') {
        tone({ type: 'square', from: 523, dur: 0.09, gain: 0.07 });
        tone({ type: 'square', from: 784, at: 0.07, dur: 0.12, gain: 0.07 });
      } else {
        tone({ type: 'sawtooth', from: 196, to: 784, dur: 0.28, gain: 0.05 });
        tone({ type: 'sine', from: 392, to: 1568, dur: 0.28, gain: 0.05 });
      }
    },
    shieldBlock() {
      tone({ type: 'square', from: 1244, to: 622, dur: 0.16, gain: 0.12 });
      noise({ dur: 0.12, gain: 0.1, freq: 2400 });
    },
    hit() {
      tone({ type: 'sawtooth', from: 170, to: 42, dur: 0.34, gain: 0.26 });
      noise({ dur: 0.3, gain: 0.28, freq: 900 });
    },
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      notes.forEach((freq, index) => tone({ type: 'triangle', from: freq, at: index * 0.11, dur: 0.24, gain: 0.14 }));
    },
    lose() {
      const notes = [392.0, 329.63, 261.63, 196.0];
      notes.forEach((freq, index) => tone({ type: 'triangle', from: freq, at: index * 0.16, dur: 0.3, gain: 0.13 }));
      noise({ at: 0.05, dur: 0.5, gain: 0.12, freq: 500 });
    },
  };
}
