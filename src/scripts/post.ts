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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hov = false, hmx = 0, t0 = performance.now(), hp = 0, lastFr = -1, liveAt = 0;

  hB.addEventListener('mouseenter', () => { hov = true; });
  hB.addEventListener('mousemove', (e) => { hmx = e.clientX - hB.getBoundingClientRect().left; });
  hB.addEventListener('mouseleave', () => {
    hov = false;
    t0 = performance.now() - hp * 8000; // resume the linear sweep from the current position (ascending)
  });

  const loop = () => {
    if (!document.body.contains(post)) return; // page gone — stop
    const live = !!hB.dataset.live; // before the morph lands: position only, no motion
    const r = strip.getBoundingClientRect(), hr = hB.getBoundingClientRect();
    if (r.width > 0 && hr.height > 0 && hr.bottom > 0) {
      const sL = r.left - hr.left, sW = r.width;
      if (live && hov) hp += (Math.max(0, Math.min(1, (hmx - sL) / sW)) - hp) * 0.18;
      else if (live && !reduced) { const ph = ((performance.now() - t0) / 16000) % 1; hp = sweepEase(ph < 0.5 ? ph * 2 : 2 - ph * 2); } // 8s each way
      const px = sL + hp * sW;
      ph.style.left = `${px}px`; tc.style.left = `${px}px`;
      tc.textContent = `0:${String(Math.min(8, Math.floor(8 * hp + 1e-6))).padStart(2, '0')}`; // one tick per second
      if (!live) { requestAnimationFrame(loop); return; }
      // Let the playhead fade in first; the frames start reacting to it a beat later.
      if (performance.now() - liveAt < 380) { requestAnimationFrame(loop); return; }
      let idx = -1;
      frames.forEach((f, i) => {
        const fr = f.getBoundingClientRect(), cx = fr.left - hr.left + fr.width / 2;
        const near = Math.abs(px - cx) < fr.width / 2 + 6, passed = px > cx;
        f.style.transform = near ? 'translateY(-16px) scale(1.06)' : 'translateY(0)';
        f.style.boxShadow = near ? '0 16px 30px rgba(43,43,34,.15),0 38px 74px rgba(60,40,20,.22)' : '';
        const dim = f.querySelector<HTMLElement>('.dimH')!;
        const target = near ? '0' : passed ? '0.45' : '1';
        if (dim.style.opacity !== target) dim.style.opacity = target;
        if (near) idx = i;
      });
      if (idx !== -1 && idx !== lastFr && hov) sfx.tick();
      lastFr = idx;
    }
    requestAnimationFrame(loop);
  };
  // Playhead starts hidden at 0 and fades in once the transition has settled;
  // frames stay still until then so nothing pops when the snapshot lifts.
  onSettled(() => { t0 = liveAt = performance.now(); hB.dataset.live = '1'; });
  requestAnimationFrame(loop);
}

function initToc(post: HTMLElement) {
  const strip = $('strip'), fill = $('stripFill');
  if (!strip || !fill) return;
  const frames = [...strip.querySelectorAll<HTMLElement>('.fr')];
  // Edge fades signal horizontal overflow (mobile): right = more ahead, left = scrolled.
  const rail = strip.querySelector<HTMLElement>('.rail')!;
  const paintFades = () => {
    const over = rail.scrollWidth - rail.clientWidth;
    rail.toggleAttribute('data-fr', over > 4 && rail.scrollLeft < over - 4);
    rail.toggleAttribute('data-fl', over > 4 && rail.scrollLeft > 4);
  };
  rail.addEventListener('scroll', paintFades, { passive: true });
  window.addEventListener('resize', paintFades);
  paintFades();
  const notes = [...post.querySelectorAll<HTMLElement>('[data-mn]')];

  const reveal = () => notes.forEach((n) => {
    if (n.dataset.shown) return;
    const r = n.getBoundingClientRect();
    if (r.top < innerHeight * 0.85 && r.bottom > 0) n.dataset.shown = '1';
  });

  let lastActive = -1;
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
  const onScroll = () => {
    if (!document.body.contains(post)) { window.removeEventListener('scroll', onScroll); return; }
    reveal();
    const max = document.documentElement.scrollHeight - innerHeight;
    // Size the fill against the rail's full content width, so progress is
    // truthful even when the labels overflow and scroll horizontally.
    fill.style.width = `${(max > 0 ? scrollY / max : 0) * rail.scrollWidth}px`;
    if (strip.getBoundingClientRect().top <= 15) strip.dataset.stuck = '1'; else delete strip.dataset.stuck;
    let active = 0;
    frames.forEach((f, i) => {
      const s = $(f.dataset.target!);
      if (s && s.getBoundingClientRect().top < innerHeight * 0.45) active = i;
    });
    if (pinned !== -1) active = pinned;
    frames.forEach((f, i) => { if (i === active) f.dataset.active = '1'; else delete f.dataset.active; });
    // Keep the active chip visible when the rail overflows.
    if (active !== lastActive) {
      lastActive = active;
      const f = frames[active];
      if (rail.scrollWidth > rail.clientWidth + 4) {
        const target = Math.max(0, Math.min(f.offsetLeft - 56, rail.scrollWidth - rail.clientWidth));
        rail.scrollTo({ left: target, behavior: 'smooth' });
      }
    }
    paintFades();
  };
  frames.forEach((f, i) => f.addEventListener('click', () => {
    sfx.tick();
    const s = $(f.dataset.target!);
    if (s) {
      pinned = i;
      releaseWhenSettled();
      scrollTo({ top: Math.max(0, s.offsetTop - 70), behavior: 'smooth' });
      onScroll();
    }
  }));
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  setTimeout(reveal, 750);
}

function initVideos(post: HTMLElement) {
  // Muted loops play only while properly on screen: start once half the
  // video is visible, stop once it's nearly gone (hysteresis, so grazing
  // the edge of the viewport doesn't start playback).
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    const v = en.target as HTMLVideoElement;
    if (en.intersectionRatio >= 0.5) v.play().catch(() => {});
    else if (en.intersectionRatio <= 0.15 && !v.paused) v.pause();
  }), { threshold: [0.15, 0.5] });
  post.querySelectorAll<HTMLVideoElement>('figure video[muted]').forEach((v) => {
    v.muted = true;
    io.observe(v);
  });
}

function init() {
  const post = $('post');
  if (!post || post.dataset.ready) return;
  post.dataset.ready = '1';
  initHero(post);
  initToc(post);
  initVideos(post);
  initShine(post);
  initGadgets(post);
  // Copy link: morph to "Link copied", then settle back.
  const share = document.getElementById('shareBtn');
  let shareT = 0;
  let wIdle = 0, wDone = 0;
  const measureShare = () => {
    if (!share) return;
    share.style.width = '';
    const idle = share.querySelector<HTMLElement>('.s-idle')!;
    const doneIn = share.querySelector<HTMLElement>('.s-done .s-in')!;
    wIdle = share.offsetWidth;
    wDone = wIdle - idle.offsetWidth + doneIn.offsetWidth;
    share.style.width = `${wIdle}px`;
  };
  measureShare();
  document.fonts?.ready.then(measureShare);
  share?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); } catch { return; }
    sfx.tick();
    share.dataset.copied = '1';
    share.style.width = `${wDone}px`;
    clearTimeout(shareT);
    shareT = window.setTimeout(() => { delete share.dataset.copied; share.style.width = `${wIdle}px`; }, 1800);
  });
  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(post)) { window.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') navigate('/');
  };
  window.addEventListener('keydown', onKey);
}

document.addEventListener('astro:page-load', init);
