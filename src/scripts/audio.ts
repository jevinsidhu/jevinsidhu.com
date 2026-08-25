/* Tiny WebAudio synth for UI sounds. No samples — every sound is a couple of
   oscillators with pitch slides, exactly as in the reference draft. The
   AudioContext is created lazily on the first user gesture so we never trip
   autoplay policy. Module scope survives ClientRouter navigations. */

const KEY = 'js-sound';
let ac: AudioContext | null = null;
let soundOn = true;
try { soundOn = localStorage.getItem(KEY) !== 'off'; } catch {}

function ctx(): AudioContext {
  if (!ac) ac = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

/** Oscillator that slides from `f` to `to` over `d` seconds, starting `t0` seconds from now. */
function slide(f: number, t0: number, d: number, g: number, type: OscillatorType, to: number) {
  if (!soundOn) return;
  const a = ctx(), o = a.createOscillator(), gn = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(to, t + d);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(gn); gn.connect(a.destination);
  o.start(t); o.stop(t + d + 0.05);
}

export const sfx = {
  tick: () => slide(350, 0, 0.045, 0.06, 'sine', 900),
  chime: () => { slide(300, 0, 0.05, 0.07, 'sine', 800); slide(400, 0.07, 0.06, 0.07, 'sine', 1100); slide(1800, 0.15, 0.12, 0.02, 'triangle', 2600); },
  eject: () => { slide(1000, 0, 0.25, 0.05, 'sine', 260); slide(500, 0.18, 0.08, 0.05, 'sine', 200); },
  buzz: () => { slide(220, 0, 0.08, 0.05, 'sine', 160); slide(200, 0.09, 0.1, 0.05, 'sine', 140); },
  theme: () => {
    // rising bubble arpeggio + sparkle shimmer
    slide(320, 0, 0.07, 0.06, 'sine', 640);
    slide(480, 0.07, 0.07, 0.06, 'sine', 960);
    slide(640, 0.14, 0.09, 0.055, 'sine', 1280);
    slide(1600, 0.2, 0.28, 0.022, 'triangle', 2400);
    slide(2400, 0.3, 0.22, 0.014, 'triangle', 3200);
  },
  palOpen: () => slide(420, 0, 0.09, 0.05, 'sine', 980),
  palClose: () => slide(700, 0, 0.09, 0.04, 'sine', 320),
};

export function isSoundOn() { return soundOn; }
export function setSoundOn(on: boolean) {
  soundOn = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
  if (on) sfx.tick();
}
