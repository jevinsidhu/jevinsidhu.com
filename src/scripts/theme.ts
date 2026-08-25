/* Theme = a `data-theme` attribute on <html>; the palette itself lives in
   global.css. Persisted in localStorage and re-applied to the incoming
   document on every view transition (see chrome.ts). */

export const THEME_KEY = 'js-theme';

export interface Theme { id: string; name: string; acc: string }

export const THEMES: Theme[] = [
  { id: 'cherry', name: 'Cherry', acc: '#C8452C' },
  { id: 'maple',  name: 'Maple',  acc: '#d47a4a' },
  { id: 'ocean',  name: 'Ocean',  acc: '#4a7fd4' },
  { id: 'matcha', name: 'Matcha', acc: '#5FA05A' },
  { id: 'grape',  name: 'Grape',  acc: '#8B6BC7' },
];

export function savedThemeIdx(): number {
  try {
    const id = localStorage.getItem(THEME_KEY);
    const i = THEMES.findIndex((t) => t.id === id);
    return i === -1 ? 0 : i;
  } catch { return 0; }
}

export function applyTheme(root: HTMLElement, idx: number) {
  root.dataset.theme = THEMES[idx].id;
}

export function saveTheme(idx: number) {
  try { localStorage.setItem(THEME_KEY, THEMES[idx].id); } catch {}
}

/** Translucent tinted wavefront expanding from (x,y), fading as it grows. */
export function sweepFrom(x: number, y: number, acc: string) {
  const s = document.createElement('div');
  s.style.cssText =
    `position:fixed;inset:0;z-index:90;pointer-events:none;mix-blend-mode:multiply;opacity:.9;` +
    `background:radial-gradient(circle at ${x}px ${y}px,color-mix(in srgb,${acc} 26%,transparent),color-mix(in srgb,${acc} 10%,transparent) 45%,transparent 70%);` +
    `clip-path:circle(0px at ${x}px ${y}px);transition:clip-path .65s cubic-bezier(.4,0,.3,1),opacity .65s ease;will-change:clip-path,opacity;contain:strict`;
  document.body.appendChild(s);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    s.style.clipPath = `circle(160% at ${x}px ${y}px)`;
    s.style.opacity = '0';
  }));
  setTimeout(() => s.remove(), 700);
}
