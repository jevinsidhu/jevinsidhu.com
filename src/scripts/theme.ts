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

/** Translucent tinted wavefront expanding from (x,y), fading as it grows.
    A disc big enough to cover the viewport from (x,y), grown with transform
    and faded with opacity — both compositor-only. (The earlier version
    animated clip-path over a full-viewport mix-blend-mode layer, which made
    the GPU re-render a viewport-sized mask + blend pass every frame and
    stalled 200–300ms on each theme pick.) The gradient reaches transparent
    well inside the disc, so no edge ever shows. */
export function sweepFrom(x: number, y: number, acc: string) {
  const R = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
  const s = document.createElement('div');
  s.style.cssText =
    `position:fixed;left:${x - R}px;top:${y - R}px;width:${R * 2}px;height:${R * 2}px;z-index:90;pointer-events:none;opacity:.9;` +
    `background:radial-gradient(circle closest-side,color-mix(in srgb,${acc} 26%,transparent),color-mix(in srgb,${acc} 10%,transparent) 45%,transparent 70%);` +
    `transform:scale(0);transition:transform .65s cubic-bezier(.4,0,.3,1),opacity .65s ease;will-change:transform,opacity;contain:strict`;
  document.body.appendChild(s);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    s.style.transform = 'scale(1)';
    s.style.opacity = '0';
  }));
  setTimeout(() => s.remove(), 700);
}
