/* Cursor-following radial highlight on any [data-shine] surface. */
export function initShine(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-shine]:not([data-shine-ready])').forEach((t) => {
    t.dataset.shineReady = '1';
    const strong = t.dataset.shine === 'strong';
    const ov = document.createElement('div');
    ov.style.cssText = `position:absolute;inset:0;border-radius:${getComputedStyle(t).borderRadius};pointer-events:none;opacity:0;transition:opacity .3s ease;z-index:2`;
    t.appendChild(ov);
    t.addEventListener('mousemove', (e) => {
      const r = t.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      ov.style.background = strong
        ? `radial-gradient(240px circle at ${x}px ${y}px, rgba(255,255,255,.45), rgba(var(--accrgb),.14) 45%, transparent 72%)`
        : `radial-gradient(180px circle at ${x}px ${y}px, rgba(var(--accrgb),.16), transparent 70%)`;
      ov.style.opacity = '1';
    });
    t.addEventListener('mouseleave', () => { ov.style.opacity = '0'; });
  });
}
