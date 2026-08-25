/* Home page behaviour: 3D card tilt following the pointer, "wow" cursor
   face over the card, tick on hover, Enter to open the featured post.
   Re-runs on every navigation to the home page via astro:page-load. */
import { navigate } from 'astro:transitions/client';
import { leafFace, cursorEnabled } from './cursor';
import { onSettled } from './settle';

// Last known pointer position, kept across navigations (this module loads once).
let mx = NaN, my = NaN;
window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

// Snap the card to whole CSS pixels. The morph draws snapshot textures at
// the card's position; at a fractional offset they are resampled (soft),
// while the live tiles paint pixel-snapped (crisp) — the swap between the
// two at landing reads as a shimmer. Integer edges make them identical.
// Runs on load, when fonts settle, on resize, right before a navigation
// snapshots the card, and right after a swap (before the new state is captured).
function snap() {
  const w = document.getElementById('cardW'), card = document.getElementById('card');
  if (!w || !card) return;
  w.style.left = ''; w.style.top = ''; w.style.width = '';
  const border = card.offsetWidth - card.clientWidth; // inner width must divide into five whole-pixel tiles
  const W = Math.floor((w.getBoundingClientRect().width - border) / 5) * 5 + border;
  w.style.width = `${W}px`;
  card.style.height = `${Math.round(W * 9 / 16)}px`; // whole-pixel height too (≤0.5px off 16:9)
  // measure the wrapper, not the (bobbing) card — the bob offset is rounded separately when frozen
  const r = w.getBoundingClientRect();
  const dx = Math.round(r.left) - r.left, dy = Math.round(r.top) - r.top;
  // relative offset: no transform (snapshot-safe) and no layout side effects (the card is centred)
  if (dx) w.style.left = `${dx}px`;
  if (dy) w.style.top = `${dy}px`;
}
if (!(window as any).__homeSnapBooted) {
  (window as any).__homeSnapBooted = true;
  window.addEventListener('resize', snap);
  document.addEventListener('astro:after-swap', snap);
}

function init() {
  // On a client-side navigation the card was already snapped at astro:after-swap,
  // *before* the browser captured the new state — snapping again here would move it.
  if (!document.documentElement.dataset.vt) { snap(); document.fonts?.ready.then(snap); }
  const w = document.getElementById('cardW');
  const card = document.getElementById('card') as HTMLAnchorElement | null;
  if (!w || !card || w.dataset.ready) return;
  w.dataset.ready = '1';
  const fine = cursorEnabled();
  let lift = false;
  let locked = false;
  let live = false; // false until the morph has landed: no tilt, no bob, no hover geometry
  // Start bobbing only after the morph has landed (bob starts at 0 offset).
  // [data-still] (server-rendered) keeps the hover geometry flat until the
  // pointer moves again, so a cursor resting on the card can't shift it.
  onSettled(() => { live = true; card.style.transform = ''; card.dataset.bob = '1'; });
  // Chrome fires synthetic mousemoves when the DOM under a resting cursor
  // changes, so only a real displacement (> 3px) counts as "moved".
  let sx = mx, sy = my;
  const onFirstMove = (e: MouseEvent) => {
    if (!document.body.contains(w)) { window.removeEventListener('mousemove', onFirstMove); return; }
    if (!live) return;
    if (Number.isNaN(sx)) { sx = e.clientX; sy = e.clientY; return; }
    if (Math.hypot(e.clientX - sx, e.clientY - sy) < 3) return;
    delete w.dataset.still;
    window.removeEventListener('mousemove', onFirstMove);
  };
  window.addEventListener('mousemove', onFirstMove);

  // The tilt lives under a CSS perspective, which the view-transition
  // pseudo-elements can't reproduce, and the hover gaps change the tiles'
  // image scale — either would make the flying slices disagree with the
  // card they lift from. So a click first "presses" the card: pointerdown
  // settles it flat and closes the gaps, and the navigation waits for that
  // to finish before the browser takes its snapshot.
  const PRESS_MS = 190;
  let pressAt = 0, navigating = false, unpressT = 0;
  const press = () => {
    if (locked) return;
    locked = true; pressAt = performance.now();
    w.dataset.press = '1'; w.style.transform = '';
  };
  const unpress = () => { if (navigating) return; locked = false; delete w.dataset.press; };
  card.addEventListener('pointerdown', () => { clearTimeout(unpressT); press(); });
  const onUp = () => {
    if (!document.body.contains(w)) { window.removeEventListener('pointerup', onUp); return; }
    clearTimeout(unpressT); unpressT = window.setTimeout(unpress, 350);
  };
  window.addEventListener('pointerup', onUp);
  const onPrep = (e: any) => {
    if (!document.body.contains(w)) { document.removeEventListener('astro:before-preparation', onPrep); return; }
    navigating = true; clearTimeout(unpressT);
    press();
    const wait = Math.max(0, PRESS_MS - (performance.now() - pressAt));
    const load = e.loader;
    e.loader = async () => {
      await Promise.all([load(), new Promise((r) => setTimeout(r, wait))]);
      // Press finished: force the wrapper exactly flat and pixel-snap it, then the browser snapshots.
      w.style.transition = 'none'; w.style.transform = 'none';
      snap();
      await new Promise((r) => requestAnimationFrame(r));
    };
  };
  document.addEventListener('astro:before-preparation', onPrep);

  if (fine) {
    const onMove = (e: MouseEvent) => {
      if (!document.body.contains(w)) { window.removeEventListener('mousemove', onMove); return; }
      if (locked || !live) return;
      const r = w.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const rx = Math.max(-1, Math.min(1, (e.clientY - cy) / 400)) * -10;
      const ry = Math.max(-1, Math.min(1, (e.clientX - cx) / 500)) * 12;
      w.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)${lift ? ' scale(1.015)' : ''}`;
    };
    window.addEventListener('mousemove', onMove);
    card.addEventListener('mouseenter', () => { lift = true; leafFace(true); }); // no sfx: sounds belong to the post screen
    card.addEventListener('mouseleave', () => { lift = false; leafFace(false); });
  }

  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(card)) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Enter' && !(e.target as HTMLElement)?.closest('a,button,input,textarea')) navigate(card.href);
  };
  window.addEventListener('keydown', onKey);
}

document.addEventListener('astro:page-load', init);
