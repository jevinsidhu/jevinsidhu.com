/* Persistent chrome: sound toggle, palette picker, leaf cursor, and the
   navigation sound hooks. The <Chrome> component is marked transition:persist
   so these DOM nodes — and this module's state — live across every page. */
import { sfx, isSoundOn, setSoundOn } from './audio';
import { THEMES, savedThemeIdx, applyTheme, saveTheme, sweepFrom } from './theme';
import { initCursor, leafSpin, leafFace } from './cursor';

const $ = (id: string) => document.getElementById(id)!;

/* ---- theme card tile (the little "memory card") ---- */
const CARD_TRANSITION = 'transform .38s cubic-bezier(.34,1.4,.4,1),filter .38s,opacity .26s ease-out,scale .42s cubic-bezier(.34,1.45,.4,1)';
function themeCard(acc: string, name: string, w: number) {
  const h = w * 1.3, c = document.createElement('div');
  c.style.cssText = `position:absolute;width:${w}px;height:${h}px;cursor:pointer;transition:${CARD_TRANSITION};will-change:transform,opacity,filter,scale;transform-origin:50% 60%`;
  c.innerHTML =
    `<div style="pointer-events:none;position:absolute;inset:0;border-radius:10% 10% 8% 8%/8% 8% 6% 6%;background:linear-gradient(158deg,color-mix(in srgb,${acc} 38%,transparent) 0%,color-mix(in srgb,${acc} 56%,transparent) 52%,color-mix(in srgb,${acc} 72%,rgba(0,0,0,.22)) 100%);border:1.5px solid color-mix(in srgb,${acc} 68%,rgba(0,0,0,.28));box-shadow:0 ${w * 0.16}px ${w * 0.4}px rgba(20,15,8,.28),inset 0 1.5px 0 rgba(255,255,255,.5),inset -2px -3px 6px color-mix(in srgb,${acc} 55%,rgba(0,0,0,.28))"></div>` +
    `<div style="pointer-events:none;position:absolute;inset:16% 14% 26%;background-image:radial-gradient(circle 1.1px,rgba(255,255,255,.32) 1px,transparent 1.8px);background-size:${w * 0.13}px ${w * 0.13}px;opacity:.45"></div>` +
    `<div style="pointer-events:none;position:absolute;top:0;left:16%;right:16%;height:7.5%;border-radius:0 0 30% 30%/0 0 100% 100%;background:color-mix(in srgb,${acc} 76%,rgba(0,0,0,.42))"></div>` +
    `<div style="pointer-events:none;position:absolute;top:19%;left:0;right:0;text-align:center;font:600 ${Math.max(7, w * 0.155)}px var(--font-sans);color:rgba(255,255,255,.94);text-shadow:0 1px 1.5px rgba(0,0,0,.22)">${name.toUpperCase()}</div>` +
    `<div style="pointer-events:none;position:absolute;top:37%;left:0;right:0;text-align:center;font:500 ${Math.max(4.5, w * 0.068)}px var(--font-mono);color:rgba(255,255,255,.6);letter-spacing:.14em">MEMORY CARD</div>` +
    `<div style="pointer-events:none;position:absolute;bottom:0;left:0;right:0;height:15%;border-radius:0 0 10% 10%/0 0 42% 42%;background:repeating-linear-gradient(90deg,color-mix(in srgb,${acc} 68%,rgba(0,0,0,.26)) 0 ${w * 0.055}px,color-mix(in srgb,${acc} 46%,transparent) ${w * 0.055}px ${w * 0.11}px)"></div>` +
    `<div style="pointer-events:none;position:absolute;inset:0;border-radius:10% 10% 8% 8%/8% 8% 6% 6%;background:linear-gradient(112deg,transparent 30%,rgba(255,255,255,.22) 44%,rgba(255,255,255,.05) 52%,transparent 60%)"></div>`;
  return c;
}

/* ---- palette panel ---- */
let palOpen = false;
let tIdx = -1;
let cards: HTMLElement[] = [];

function togglePal(to?: boolean) {
  const p = $('palPanel'), btn = $('palBtn');
  palOpen = to === undefined ? !palOpen : to;
  p.style.transform = palOpen ? 'scale(1)' : 'scale(.4)';
  p.style.opacity = palOpen ? '1' : '0';
  p.style.pointerEvents = palOpen ? 'auto' : 'none';
  btn.style.transform = palOpen ? 'scale(.88)' : '';
  if (palOpen) {
    sfx.palOpen();
    // entry: each tile fades and scales in, in sequence (compositor-only properties).
    // Set all start states, flush layout once, then stagger the end states.
    const entering = cards.filter((_, i) => i !== tIdx);
    entering.forEach((c) => { c.style.transition = 'none'; c.style.opacity = '0'; c.style.scale = '.55'; });
    void p.offsetWidth;
    entering.forEach((c) => { c.style.transition = CARD_TRANSITION; });
    entering.forEach((c, i) => setTimeout(() => { c.style.opacity = '.85'; c.style.scale = '1'; }, 80 + i * 60));
  } else sfx.palClose();
}

function initPalette() {
  const tray = $('palPanel');
  tray.innerHTML = '';
  const CW = 50, GAP = 10, N = THEMES.length, W = 352, H = 150;
  const rowX = (i: number) => (W - (N * CW + (N - 1) * GAP)) / 2 + i * (CW + GAP);
  const CH = CW * 1.3, shelfY = (H - CH) / 2;

  const bloom = document.createElement('div');
  bloom.style.cssText = `position:absolute;top:${shelfY + CH / 2 - 72}px;width:144px;height:144px;border-radius:50%;transition:left .5s cubic-bezier(.4,1.2,.4,1),background .5s;pointer-events:none;z-index:1`;
  tray.appendChild(bloom);

  let sweepT = 0;
  const seat = (i: number, animate: boolean) => {
    if (i === tIdx) return;
    clearTimeout(sweepT);
    tIdx = i;
    cards.forEach((x, j) => {
      if (j === i) { x.style.transform = 'scale(1.1)'; x.style.filter = ''; x.style.opacity = '1'; x.style.zIndex = '3'; }
      else { x.style.transform = ''; x.style.filter = 'saturate(.5) brightness(.55)'; x.style.opacity = '.85'; x.style.zIndex = '2'; }
    });
    bloom.style.left = `${rowX(i) + CW / 2 - 72}px`;
    bloom.style.background = `radial-gradient(closest-side,color-mix(in srgb,${THEMES[i].acc} 52%,transparent),transparent 72%)`;
    if (!animate) { applyTheme(document.documentElement, i); return; }
    leafSpin();
    sweepT = window.setTimeout(() => {
      const br = $('palBtn').getBoundingClientRect();
      applyTheme(document.documentElement, i);
      saveTheme(i);
      sfx.theme();
      sweepFrom(br.left + br.width / 2, br.top + br.height / 2, THEMES[i].acc);
      if (palOpen) togglePal(false);
    }, 260);
  };

  cards = THEMES.map((t, i) => {
    const c = themeCard(t.acc, t.name, CW);
    c.style.left = `${rowX(i)}px`; c.style.top = `${shelfY}px`; c.style.zIndex = '2';
    c.dataset.hot = '';
    c.title = t.name;
    tray.appendChild(c);
    c.addEventListener('mouseenter', () => { if (i !== tIdx) { c.style.transform = 'translateY(-4px)'; sfx.tick(); } });
    c.addEventListener('mouseleave', () => { if (i !== tIdx) c.style.transform = ''; });
    c.addEventListener('click', (e) => { e.stopPropagation(); seat(i, true); });
    return c;
  });
  seat(savedThemeIdx(), false);

  $('palBtn').addEventListener('click', () => togglePal());
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element;
    if (palOpen && !t.closest('#palPanel') && !t.closest('#palBtn')) togglePal(false);
  });
}

/* ---- sound toggle ---- */
function initSound() {
  const btn = $('sndBtn');
  const paint = () => {
    $('sndOnIc').style.display = isSoundOn() ? 'block' : 'none';
    $('sndOffIc').style.display = isSoundOn() ? 'none' : 'block';
    btn.setAttribute('aria-pressed', String(isSoundOn()));
  };
  paint();
  btn.addEventListener('click', () => { setSoundOn(!isSoundOn()); paint(); });
}

/* ---- navigation hooks ---- */
function initNavigation() {
  // Fires synchronously inside the click that started the navigation, so the
  // AudioContext is allowed to play. Home ← case study plays the eject sound;
  // anything → case study plays the chime.
  document.addEventListener('astro:before-preparation', (e: any) => {
    const to: URL = e.to, from: URL = e.from;
    leafFace(false); // the card's mouseleave never fires once it's swapped away
    if (to.pathname === '/' && from.pathname !== '/') sfx.eject();
    else if (to.pathname !== from.pathname) sfx.chime();
    // Freeze the bobbing card *at its current offset* so the snapshot and
    // the live element agree and nothing jumps before the morph begins.
    const card = document.getElementById('card');
    if (card) {
      // Round the frozen bob offset to a whole pixel so the snapshot is drawn 1:1.
      const m = getComputedStyle(card).transform.match(/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/);
      const ty = m ? Math.round(parseFloat(m[1])) : 0;
      card.style.transform = ty ? `translateY(${ty}px)` : 'translateY(0)';
      card.removeAttribute('data-bob');
    }
  });
  // Carry the theme onto the incoming document before it's swapped in — no flash.
  document.addEventListener('astro:before-swap', (e: any) => {
    applyTheme(e.newDocument.documentElement, tIdx < 0 ? savedThemeIdx() : tIdx);
    if (document.documentElement.dataset.leaf) e.newDocument.documentElement.dataset.leaf = '1';
  });
}

/* ---- receding chrome (mobile): hide on scroll down, show on scroll up ---- */
function initRecede() {
  let lastY = scrollY;
  const top = $('topBtn');
  top.addEventListener('click', () => { sfx.tick(); scrollTo({ top: 0, behavior: 'smooth' }); });
  const onScroll = () => {
    top.toggleAttribute('data-show', scrollY > 600);
    if (!matchMedia('(max-width: 780px)').matches) { delete document.documentElement.dataset.chromeHidden; lastY = scrollY; return; }
    const dy = scrollY - lastY;
    if (Math.abs(dy) < 6) return;
    if (dy > 0 && scrollY > 140) document.documentElement.dataset.chromeHidden = '1';
    else if (dy < 0 || scrollY <= 140) delete document.documentElement.dataset.chromeHidden;
    lastY = scrollY;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('astro:after-swap', () => { delete document.documentElement.dataset.chromeHidden; lastY = 0; top.removeAttribute('data-show'); });
}

/* ---- boot once ---- */
if (!(window as any).__chromeBooted) {
  (window as any).__chromeBooted = true;
  initCursor($('leafCur'));
  initRecede();
  initPalette();
  initSound();
  initNavigation();
}
