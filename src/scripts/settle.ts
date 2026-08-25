/* "Settled" = the view transition (if any) has fully finished animating.
   Astro fires astro:page-load right after the DOM swap, while the morph is
   still running; anything that moves elements at that point pops when the
   snapshot is replaced by the live DOM. Page scripts use onSettled() to
   defer their motion until the morph is done. */

let settled = true;
let waiters: Array<() => void> = [];

export function isSettled() { return settled; }

export function onSettled(fn: () => void) {
  if (settled) fn(); else waiters.push(fn);
}

function viewTransitionAnimations() {
  return document.getAnimations().filter((a) => {
    const pe = (a.effect as KeyframeEffect | null)?.pseudoElement;
    return typeof pe === 'string' && pe.startsWith('::view-transition');
  });
}

if (!(window as any).__settleBooted) {
  (window as any).__settleBooted = true;
  document.addEventListener('astro:before-preparation', (e: any) => {
    settled = false;
    document.documentElement.dataset.vt = '1';
    document.documentElement.dataset.vtTo = e.to?.pathname === '/' ? 'home' : 'post';
  });
  // The incoming <html> replaces ours, so carry the flags over for the pseudo-element rules.
  document.addEventListener('astro:before-swap', (e: any) => {
    e.newDocument.documentElement.dataset.vt = '1';
    e.newDocument.documentElement.dataset.vtTo = document.documentElement.dataset.vtTo;
  });
  document.addEventListener('astro:page-load', async () => {
    // page-load fires right after the DOM update callback — the browser may
    // not have built the ::view-transition pseudo tree (and its animations)
    // yet. Poll a few frames for them before deciding there's nothing to wait for.
    let anims = viewTransitionAnimations();
    const deadline = performance.now() + 250;
    while (!anims.length && !settled && performance.now() < deadline) {
      await new Promise((r) => requestAnimationFrame(r));
      anims = viewTransitionAnimations();
    }
    if (anims.length) {
      await Promise.race([
        Promise.allSettled(anims.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 1500)), // safety net
      ]);
    }
    settled = true;
    delete document.documentElement.dataset.vt;
    delete document.documentElement.dataset.vtTo;
    const w = waiters; waiters = [];
    w.forEach((f) => f());
  });
}
