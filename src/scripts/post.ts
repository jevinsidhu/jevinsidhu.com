/* Case-study page behaviour: hero playhead sweep, sticky TOC with scroll
   progress + active section, margin-note reveal, video speed toggles,
   cursor shine, Esc to go home. Idempotent; runs on astro:page-load. */
import { navigate } from 'astro:transitions/client';
import { sfx } from './audio';
import { initShine } from './shine';
import { initGadgets } from './gadgets';
import { onSettled } from './settle';

const $ = (id: string) => document.getElementById(id);

// Constant-speed sweep with a short velocity ramp at each end (ease out of
// one edge, into the other); the middle stays linear. u,result in [0,1].
const RAMP = 0.15;
function sweepEase(u: number) {
  const v = 1 / (1 - RAMP); // cruise speed so the whole sweep still covers 0→1
  if (u < RAMP) return v * u * u / (2 * RAMP);
  if (u > 1 - RAMP) return 1 - v * (1 - u) * (1 - u) / (2 * RAMP);
  return v * (u - RAMP / 2);
}

function initHero(post: HTMLElement) {
  const hB = $('heroBand'), strip = $('heroStrip'), ph = $('phH'), tc = $('tcH');
  if (!hB || !strip || !ph || !tc) return;
  const frames = [...hB.querySelectorAll<HTMLElement>('.frH')];
  const dims = frames.map((f) => f.querySelector<HTMLElement>('.dimH')!);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hov = false, hmx = 0, t0 = performance.now(), hp = 0, lastFr = -1, liveAt = 0;
  let lastPx = NaN, lastLabel = tc.textContent;

  // Scrubbing is bound to the filmstrip itself, not the whole band — the
  // empty space around the frames shouldn't drag the playhead. (mouseleave
  // ignores moves into descendants, so a lifted frame doesn't break it.)
  strip.addEventListener('mouseenter', () => { hov = true; });
  strip.addEventListener('mousemove', (e) => { hmx = e.clientX - hB.getBoundingClientRect().left; });
  strip.addEventListener('mouseleave', () => {
    hov = false;
    t0 = performance.now() - hp * 8000; // resume the linear sweep from the current position (ascending)
  });

  // The loop runs only while the band is on screen (the observer below stops
  // it when the hero scrolls away and restarts it on the way back), and each
  // frame does all its geometry reads before any style write — interleaving
  // them forced a synchronous layout every frame.
  let running = false, onScreen = true;
  const loop = () => {
    if (!document.body.contains(post) || !onScreen) { running = false; return; }
    const live = !!hB.dataset.live; // before the morph lands: position only, no motion
    const r = strip.getBoundingClientRect(), hr = hB.getBoundingClientRect();
    if (r.width > 0 && hr.height > 0 && hr.bottom > 0) {
      const sL = r.left - hr.left, sW = r.width;
      if (live && hov) hp += (Math.max(0, Math.min(1, (hmx - sL) / sW)) - hp) * 0.18;
      else if (live && !reduced) { const ph = ((performance.now() - t0) / 16000) % 1; hp = sweepEase(ph < 0.5 ? ph * 2 : 2 - ph * 2); } // 8s each way
      const px = sL + hp * sW;
      // Let the playhead fade in first; the frames start reacting to it a beat later.
      const reacting = live && performance.now() - liveAt >= 380;
      const geo = reacting ? frames.map((f) => { const fr = f.getBoundingClientRect(); return { cx: fr.left - hr.left + fr.width / 2, half: fr.width / 2 + 6 }; }) : null;
      // ---- writes ----
      // transforms, not `left`: layout properties force reflow every frame (janky on iOS)
      if (px !== lastPx) {
        lastPx = px;
        ph.style.transform = `translateX(${px}px)`;
        tc.style.transform = `translateX(${px}px) translateX(-50%)`;
      }
      const label = `0:${String(Math.min(8, Math.floor(8 * hp + 1e-6))).padStart(2, '0')}`; // one tick per second
      if (label !== lastLabel) { lastLabel = label; tc.textContent = label; }
      if (geo) {
        let idx = -1;
        geo.forEach((g, i) => {
          const near = Math.abs(px - g.cx) < g.half, passed = px > g.cx;
          // attribute toggle → CSS transform + pre-rendered shadow crossfade
          // (animating box-shadow inline repaints every frame; stutters on iOS)
          frames[i].toggleAttribute('data-lift', near);
          const target = near ? '0' : passed ? '0.45' : '1';
          if (dims[i].style.opacity !== target) dims[i].style.opacity = target;
          if (near) idx = i;
        });
        if (idx !== -1 && idx !== lastFr && hov) sfx.tick();
        lastFr = idx;
      }
    }
    requestAnimationFrame(loop);
  };
  const start = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) start(); }, { rootMargin: '120px 0px' }).observe(hB);
  // Playhead starts hidden at 0 and fades in once the transition has settled;
  // frames stay still until then so nothing pops when the snapshot lifts.
  onSettled(() => { t0 = liveAt = performance.now(); hB.dataset.live = '1'; });
  start();
}

function initToc(post: HTMLElement) {
  const strip = $('strip'), fill = $('stripFill');
  if (!strip || !fill) return;
  const frames = [...strip.querySelectorAll<HTMLElement>('.fr')];
  const targets = frames.map((f) => $(f.dataset.target!));
  const rail = strip.querySelector<HTMLElement>('.rail')!;
  // The progress bar is sized once to the rail's full content width (so it
  // stays truthful when the labels overflow and scroll horizontally); each
  // scroll frame then only sets a compositor-only scaleX on it.
  let railW = 0;
  const sizeFill = () => { const w = rail.scrollWidth; if (w !== railW) { railW = w; fill.style.width = `${w}px`; } };
  // Edge fades signal horizontal overflow (mobile): right = more ahead, left = scrolled.
  const paintFades = (over: number, left: number) => {
    rail.toggleAttribute('data-fr', over > 4 && left < over - 4);
    rail.toggleAttribute('data-fl', over > 4 && left > 4);
  };
  rail.addEventListener('scroll', () => paintFades(rail.scrollWidth - rail.clientWidth, rail.scrollLeft), { passive: true });
  window.addEventListener('resize', () => { sizeFill(); onScroll(); });
  const notes = [...post.querySelectorAll<HTMLElement>('[data-mn]')];

  const reveal = () => notes.forEach((n) => {
    if (n.dataset.shown) return;
    const r = n.getBoundingClientRect();
    if (r.top < innerHeight * 0.85 && r.bottom > 0) n.dataset.shown = '1';
  });

  let lastActive = -1, lastStuck = false, lastP = -1;
  // While a chip-tap glide is in flight, pin the active chip and stop the
  // rail from chasing every intermediate section (no jitter).
  let pinned = -1, settleRaf = 0;
  const releaseWhenSettled = () => {
    cancelAnimationFrame(settleRaf);
    let lastY = scrollY, still = 0;
    const tick = () => {
      if (Math.abs(scrollY - lastY) < 1) still++; else { still = 0; lastY = scrollY; }
      if (still > 8) { pinned = -1; onScroll(); return; }
      settleRaf = requestAnimationFrame(tick);
    };
    settleRaf = requestAnimationFrame(tick);
  };
  // Runs on every scroll frame: all geometry reads come first, then only the
  // writes whose value actually changed. (Writing the fill width and then
  // measuring the strip forced a synchronous layout on every frame.)
  const onScroll = () => {
    if (!document.body.contains(post)) { window.removeEventListener('scroll', onScroll); return; }
    reveal();
    // ---- reads ----
    const y = scrollY, vh = innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    const stuck = strip.getBoundingClientRect().top <= 15;
    let active = 0;
    targets.forEach((s, i) => { if (s && s.getBoundingClientRect().top < vh * 0.45) active = i; });
    if (pinned !== -1) active = pinned;
    const over = rail.scrollWidth - rail.clientWidth, left = rail.scrollLeft;
    const chipLeft = active !== lastActive ? frames[active].offsetLeft : 0;
    // ---- writes ----
    const p = max > 0 ? Math.min(1, y / max) : 0;
    if (p !== lastP) { lastP = p; fill.style.transform = `scaleX(${p})`; }
    if (stuck !== lastStuck) { lastStuck = stuck; if (stuck) strip.dataset.stuck = '1'; else delete strip.dataset.stuck; }
    if (active !== lastActive) {
      lastActive = active;
      frames.forEach((f, i) => { if (i === active) f.dataset.active = '1'; else delete f.dataset.active; });
      // Keep the active chip visible when the rail overflows.
      if (over > 4) rail.scrollTo({ left: Math.max(0, Math.min(chipLeft - 56, over)), behavior: 'smooth' });
    }
    paintFades(over, left);
  };
  frames.forEach((f, i) => f.addEventListener('click', () => {
    sfx.tick();
    const s = targets[i];
    if (s) {
      pinned = i;
      releaseWhenSettled();
      scrollTo({ top: Math.max(0, s.offsetTop - 70), behavior: 'smooth' });
      onScroll();
    }
  }));
  window.addEventListener('scroll', onScroll, { passive: true });
  sizeFill();
  onScroll();
  document.fonts?.ready.then(sizeFill); // label widths settle with the webfont
  setTimeout(reveal, 750);
}

function initVideos(post: HTMLElement) {
  // Muted loops play only while properly on screen: start once half the
  // video is visible, stop once it's nearly gone (hysteresis, so grazing
  // the edge of the viewport doesn't start playback).
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    const v = en.target as HTMLVideoElement;
    if (en.intersectionRatio >= 0.5) { v.dataset.want = '1'; v.play().catch(() => {}); }
    else if (en.intersectionRatio <= 0.15) { delete v.dataset.want; if (!v.paused) v.pause(); }
  }), { threshold: [0.15, 0.5] });
  // Pre-warm the decoder before a video reaches the viewport (iOS shows a
  // blank flick if playback starts before any frame is decoded): a brief
  // muted play-pause pulls the first frame in.
  const warm = new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting) return;
    const v = en.target as HTMLVideoElement;
    warm.unobserve(v);
    v.play().then(() => { if (!v.dataset.want) v.pause(); }).catch(() => {});
  }), { rootMargin: '500px 0px' });
  // (figure.player is excluded — the walkthrough has its own controller;
  // two observers issuing play/pause fight each other)
  const loops = [...post.querySelectorAll<HTMLVideoElement>('figure:not(.player) video[muted]')];
  loops.forEach((v) => {
    v.muted = true;
    // The overlay poster hides the swap: fade it only once frames render.
    const poster = v.parentElement?.querySelector<HTMLElement>('.vposter');
    if (poster) {
      const onTime = () => { if (v.currentTime > 0.03) { poster.dataset.hide = '1'; v.removeEventListener('timeupdate', onTime); } };
      v.addEventListener('timeupdate', onTime);
    }
  });
  // The loops are preload="none", so observing them is what starts their
  // loads: wait for the morph to land (immediate on a direct visit) rather
  // than spinning up sixteen media pipelines while the slices are flying.
  onSettled(() => loops.forEach((v) => { if (document.body.contains(v)) { io.observe(v); warm.observe(v); } }));
}

// Copy link: morph to "Link copied", then settle back.
function initShare() {
  const share = document.getElementById('shareBtn');
  if (!share) return;
  let shareT = 0;
  let wIdle = 0, wDone = 0;
  const measureShare = () => {
    share.style.width = '';
    const idle = share.querySelector<HTMLElement>('.s-idle')!;
    const doneIn = share.querySelector<HTMLElement>('.s-done .s-in')!;
    wIdle = share.offsetWidth;
    wDone = wIdle - idle.offsetWidth + doneIn.offsetWidth;
    share.style.width = `${wIdle}px`;
  };
  measureShare();
  document.fonts?.ready.then(measureShare);
  share.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { return; }
    sfx.tick();
    share.dataset.copied = '1';
    share.style.width = `${wDone}px`;
    clearTimeout(shareT);
    shareT = window.setTimeout(() => { delete share.dataset.copied; share.style.width = `${wIdle}px`; }, 1800);
  });
}

function init() {
  const post = $('post');
  if (!post || post.dataset.ready) return;
  post.dataset.ready = '1';
  initHero(post);
  initToc(post);
  initVideos(post);
  initGadgets(post);
  // Hover shine and the share pill's measurement can wait until the morph has
  // landed: neither is visible mid-transition, and both force layout.
  onSettled(() => { if (document.body.contains(post)) { initShine(post); initShare(); } });
  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(post)) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') navigate('/');
  };
  window.addEventListener('keydown', onKey);
}

document.addEventListener('astro:page-load', init);
