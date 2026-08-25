/* The leaf cursor: a theme-tinted SVG that lerps after the pointer, sways
   while idle, grows on hover targets, squashes on press, and swaps to a
   "wow" face when something exciting is under it. Only enabled for fine
   pointers with motion allowed; touch devices keep the native cursor. */

const HOT = 'a, button, [data-hot], .fr, #card, #palPanel, video';

const LEAF_BODY =
  'M256 21 l-25 47 c-3 6 -8 5 -13 3 l-18 -9 12 63 c3 13 -6 13 -11 8 l-27 -31 -5 19 c-1 4 -4 8 -11 7 l-40 -8 11 39 c2 9 4 12 -3 15 l-14 7 68 55 c7 5 10 15 8 23 l-6 20 66 -8 c8 -1 13 4 13 10 l-3 58 h14 l-3 -58 c0 -6 5 -11 13 -10 l66 8 -6 -20 c-2 -8 1 -18 8 -23 l68 -55 -14 -7 c-7 -3 -5 -6 -3 -15 l11 -39 -40 8 c-7 1 -10 -3 -11 -7 l-5 -19 -27 31 c-5 5 -14 5 -11 -8 l12 -63 -18 9 c-5 2 -10 3 -13 -3 z';
const INK = 'color-mix(in srgb, var(--acc) 30%, #241505)';
const BLUSH = 'color-mix(in srgb, var(--acc) 55%, #f03d3d)';

function shell(face: string, key: string) {
  return `<svg width="58" height="58" viewBox="0 0 512 512" style="display:block">
<defs><radialGradient id="lg-${key}" cx="42%" cy="30%" r="85%">
<stop offset="0%" style="stop-color:color-mix(in srgb, var(--acc) 62%, #fff)"/>
<stop offset="55%" style="stop-color:color-mix(in srgb, var(--acc) 92%, #fff)"/>
<stop offset="100%" style="stop-color:color-mix(in srgb, var(--acc) 82%, #000)"/></radialGradient></defs>
<path d="${LEAF_BODY}" fill="url(#lg-${key})" style="stroke:color-mix(in srgb, var(--acc) 62%, #000)" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>${face}</svg>`;
}
const FACE_CALM =
  `<g style="stroke:${INK}" stroke-width="17" fill="none" stroke-linecap="round"><path d="M196 187 q22 -27 44 0"/><path d="M272 187 q22 -27 44 0"/><path d="M221 223 q35 32 70 0"/></g>` +
  `<ellipse cx="170" cy="217" rx="24" ry="14" style="fill:${BLUSH}" opacity=".55"/><ellipse cx="342" cy="217" rx="24" ry="14" style="fill:${BLUSH}" opacity=".55"/>`;
const FACE_WOW =
  `<g style="fill:${INK}"><circle cx="218" cy="178" r="19"/><circle cx="294" cy="178" r="19"/></g><g fill="#fff"><circle cx="223" cy="171" r="6"/><circle cx="299" cy="171" r="6"/></g>` +
  `<g style="stroke:${INK}" stroke-width="12" fill="none" stroke-linecap="round"><path d="M196 152 q22 -14 44 -4"/><path d="M272 148 q22 -10 44 4"/></g>` +
  `<ellipse cx="256" cy="230" rx="17" ry="22" style="fill:${INK}"/><ellipse cx="168" cy="212" rx="24" ry="14" style="fill:${BLUSH}" opacity=".6"/><ellipse cx="342" cy="212" rx="24" ry="14" style="fill:${BLUSH}" opacity=".6"/>`;

export function cursorEnabled() {
  return matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches;
}

export function initCursor(lc: HTMLElement) {
  if (!cursorEnabled()) { lc.remove(); return; }
  document.documentElement.dataset.leaf = '1';

  const inner = lc.querySelector<HTMLElement>('.curInner')!;
  inner.innerHTML =
    `<div data-lf="calm" class="curIdle">${shell(FACE_CALM, 'calm')}</div>` +
    `<div data-lf="wow" class="curIdle" style="position:absolute;inset:0;opacity:0">${shell(FACE_WOW, 'wow')}</div>`;

  let mx = -100, my = -100, x = -100, y = -100, shown = false;
  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (!shown) { shown = true; lc.style.opacity = '1'; }
    if (lc.dataset.state !== 'press') {
      const t = e.target as Element | null;
      lc.dataset.state = t?.closest?.(HOT) ? 'hover' : '';
    }
  });
  document.addEventListener('mouseleave', () => {
    if (document.documentElement.dataset.vt) return; // DOM swap mid-transition, not a real exit
    shown = false; lc.style.opacity = '0';
  });
  window.addEventListener('pointerdown', () => { lc.dataset.state = 'press'; });
  window.addEventListener('pointerup', (e) => {
    const t = e.target as Element | null;
    lc.dataset.state = t?.closest?.(HOT) ? 'hover' : '';
  });
  // During a view transition the live element is hidden under the snapshot
  // layer; steer its pseudo-element group from the pointer instead.
  const vtStyle = document.createElement('style');
  document.head.appendChild(vtStyle);
  const loop = () => {
    x += (mx - x) * 0.3; y += (my - y) * 0.3;
    const t = `translate(${x - 20}px,${y - 14}px)`;
    lc.style.transform = t;
    if (document.documentElement.dataset.vt) {
      if (!vtStyle.isConnected) document.head.appendChild(vtStyle);
      vtStyle.textContent = `::view-transition-group(leaf){transform:${t} !important}`;
    } else if (vtStyle.textContent) vtStyle.textContent = '';
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function leafFace(wow: boolean) {
  const lc = document.getElementById('leafCur'); if (!lc) return;
  const calm = lc.querySelector<HTMLElement>('[data-lf="calm"]'), w = lc.querySelector<HTMLElement>('[data-lf="wow"]');
  if (!calm || !w) return; // faces only exist when the custom cursor is active
  calm.style.opacity = wow ? '0' : '1';
  w.style.opacity = wow ? '1' : '0';
}

export function leafSpin() {
  const lc = document.getElementById('leafCur'); if (!lc) return;
  delete lc.dataset.spin; void lc.offsetWidth; lc.dataset.spin = '1';
  setTimeout(() => { delete lc.dataset.spin; }, 725);
}
