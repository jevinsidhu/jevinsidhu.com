/* Media behaviours on the case-study page: the voiceover player and the
   fullscreen viewer (a FLIP lightbox — the asset lifts out of the page to
   the centre of the screen and settles back into its spot on close). */
import { sfx } from './audio';

const q = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!;
const qa = <T extends HTMLElement>(root: ParentNode, sel: string) => [...root.querySelectorAll<T>(sel)];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- voiceover player ----
   Autoplays muted while on screen, like an ambient demo reel; one obvious
   pill turns the voiceover on. When it ends with sound, it settles back
   into muted ambient play and offers the pill again. */
function initPlayer(p: HTMLElement) {
  const v = q<HTMLVideoElement>(p, 'video'), fill = q(p, '[data-fill]'), time = q(p, '[data-time]');
  let userPaused = false;
  const paint = () => {
    p.toggleAttribute('data-playing', !v.paused);
    p.toggleAttribute('data-muted', v.muted);
    if (v.duration) {
      fill.style.width = `${(v.currentTime / v.duration) * 100}%`;
      time.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    }
  };
  // Sound is opt-in per visit: a previous unmute must never carry over.
  // Element state can survive a navigation (bfcache restore, persisted DOM),
  // so reset explicitly on init and whenever the page is shown again.
  const resetAudio = () => { v.muted = true; p.removeAttribute('data-started'); paint(); };
  resetAudio();
  window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) resetAudio(); });
  document.addEventListener('astro:after-swap', () => { if (document.body.contains(v)) resetAudio(); });
  const soundOn = () => {
    v.muted = false; userPaused = false;
    v.play().then(() => { p.dataset.started = '1'; sfx.tick(); }).catch(() => {});
  };
  const toggle = () => {
    if (v.paused) { userPaused = false; v.play().catch(() => {}); }
    else { userPaused = true; v.pause(); }
  };
  q(p, '[data-play]').addEventListener('click', soundOn);
  q(p, '[data-toggle]').addEventListener('click', toggle);
  v.addEventListener('click', () => { if (p.dataset.started) toggle(); else soundOn(); });
  q(p, '[data-mute]').addEventListener('click', () => { v.muted = !v.muted; paint(); sfx.tick(); });
  q(p, '[data-track]').addEventListener('click', (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (v.duration) v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  });
  ['play', 'pause', 'timeupdate', 'volumechange', 'loadedmetadata'].forEach((n) => v.addEventListener(n, paint));
  const poster = p.querySelector<HTMLElement>('.vposter');
  if (poster) {
    const onTime = () => { if (v.currentTime > 0.03) { poster.dataset.hide = '1'; v.removeEventListener('timeupdate', onTime); } };
    v.addEventListener('timeupdate', onTime);
  }
  v.addEventListener('ended', () => {
    v.currentTime = 0;
    if (!v.muted) { delete p.dataset.started; v.muted = true; } // back to ambient
    v.play().catch(() => {});
  });
  // Ambient rules with hysteresis: start once half the player is visible,
  // pause once it's nearly gone — and respect a reader's manual pause.
  new IntersectionObserver((es) => es.forEach((en) => {
    if (en.intersectionRatio >= 0.5) { if (!userPaused) v.play().catch(() => {}); }
    else if (en.intersectionRatio <= 0.15 && !v.paused) v.pause();
  }), { threshold: [0.15, 0.5] }).observe(p);
}

/* ---- fullscreen viewer ----
   Tap an image or muted loop → it flies from its place in the page to the
   centre over a dimmed scrim; Esc / tap returns it exactly where it came
   from. The original keeps its layout slot (visibility: hidden); a fixed
   twin does the flying — transform-only, so the flight stays on the GPU. */
let lbOpen = false;

/* A twin that hasn't got pixels yet is the whole flicker: a freshly created
   <img> is undecoded (naturalWidth 0) at insert, and a fresh <video> sits at
   readyState 0 — measured ~34ms to its first presented frame even from cache.
   Hide the original before then and the reader sees an empty box, or the
   video's frame-0 poster, for a few frames. So wait for real pixels. */
function twinReady(media: HTMLImageElement | HTMLVideoElement) {
  const painted = new Promise<void>((res) => {
    if (media instanceof HTMLVideoElement) {
      // readyState >= HAVE_CURRENT_DATA: the frame at currentTime can render
      if (media.readyState >= 2) res();
      else media.addEventListener('loadeddata', () => res(), { once: true });
    } else {
      media.decode().then(() => res(), () => res()); // decode() also rasterises
    }
  });
  // never let a stalled asset hold the tap hostage
  return Promise.race([painted, new Promise<void>((res) => setTimeout(res, 600))]);
}

function openViewer(el: HTMLImageElement | HTMLVideoElement) {
  if (lbOpen) return;
  lbOpen = true;
  const isVideo = el.tagName === 'VIDEO';
  // The "presentation" element is what the reader actually sees framed:
  // phone loops live inside a rounded, bordered .frame; figures carry the
  // border on the media itself. The twin copies it so both endpoints of the
  // flight are pixel-identical and nothing pops at the swap.
  const pres = (el.closest('.frame') as HTMLElement) ?? el;
  // ...but what gets *hidden* is the whole shell: figure videos carry a
  // separate .vposter overlay pinned over them, and hiding only the <video>
  // leaves that still frame sitting on the page under the open lightbox.
  const shell = (el.closest('.frame, .vshell') as HTMLElement) ?? pres;
  const pcs = getComputedStyle(pres);
  const rect = pres.getBoundingClientRect();
  const caption = el.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
  const dur = reduced() ? 0 : 0.46;
  // Accumulated rotation of the source (e.g. tilted shelf cards): the twin
  // flies with it, so lift-off and landing are pixel-true — no snap.
  const angleOf = () => {
    let a = 0, n: HTMLElement | null = pres;
    while (n && n !== document.body) {
      const t = getComputedStyle(n).transform;
      if (t && t !== 'none') { const m = new DOMMatrix(t); a += Math.atan2(m.b, m.a) * 180 / Math.PI; }
      n = n.parentElement;
    }
    return a;
  };

  const aspect = pres.offsetWidth / pres.offsetHeight;
  const capRoom = caption ? 56 : 0;
  const maxW = Math.min(innerWidth * 0.9, 1160), maxH = innerHeight * 0.86 - capRoom;
  const tw = Math.min(maxW, maxH * aspect), th = tw / aspect;
  const tx = (innerWidth - tw) / 2, ty = (innerHeight - th - capRoom) / 2 + (caption ? 8 : 0);

  const srcBorder = parseFloat(pcs.borderWidth) || 0;
  const srcRadius = parseFloat(pcs.borderRadius) || 0;
  // Centre-based mapping (origin 50% 50%): translate the twin's centre onto
  // the source's centre, rotate by the source's tilt, scale uniformly.
  const map = (r: DOMRect) => {
    const s = pres.offsetWidth / tw;
    const dx = (r.left + r.width / 2) - (tx + tw / 2);
    const dy = (r.top + r.height / 2) - (ty + th / 2);
    return { t: `translate(${dx}px,${dy}px) rotate(${angleOf()}deg) scale(${s})`, s };
  };
  const m0 = map(rect);

  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', caption || 'Media viewer');
  lb.innerHTML = `<div class="lb-scrim"></div><button class="lb-close" aria-label="Close" data-hot>✕</button>${caption ? `<div class="lb-cap" style="top:${ty + th + 18}px"></div>` : ''}`;
  if (caption) q(lb, '.lb-cap').textContent = caption;

  let media: HTMLImageElement | HTMLVideoElement;
  if (isVideo) {
    const sv = el as HTMLVideoElement;
    const tv = document.createElement('video');
    tv.src = sv.currentSrc || sv.src; tv.poster = sv.poster; tv.preload = 'auto';
    tv.muted = true; tv.loop = true; tv.playsInline = true; tv.autoplay = true;
    tv.currentTime = sv.currentTime;
    sv.pause();
    media = tv;
  } else {
    const si = el as HTMLImageElement;
    const ti = document.createElement('img');
    ti.src = si.currentSrc || si.src; ti.alt = si.alt;
    media = ti;
  }
  const twin = document.createElement('div');
  twin.className = 'lb-media';
  twin.appendChild(media);
  // Scale-compensated frame: transforms scale borders and radii, so divide
  // by the current scale to make the start state visually identical to the
  // original, then transition to the open values alongside the flight.
  const FLIGHT = `transform ${dur}s cubic-bezier(.3,.9,.3,1), border-radius ${dur}s, border-width ${dur}s, box-shadow ${dur}s ease`;
  // Starts transparent, stacked exactly over the still-visible original, so
  // the wait for pixels costs nothing on screen.
  twin.style.cssText = `left:${tx}px;top:${ty}px;width:${tw}px;height:${th}px;` +
    `border:${srcBorder / m0.s}px solid ${pcs.borderColor};border-radius:${srcRadius / m0.s}px;` +
    `background:${pcs.backgroundColor};transform:${m0.t};opacity:0;transition:${FLIGHT};`;
  lb.appendChild(twin);
  lb.style.setProperty('--dur', `${Math.max(dur, 0.01)}s`);
  document.body.appendChild(lb);
  // Lock scroll without a layout shift: swap the scrollbar for equal padding,
  // otherwise the page widens, everything moves, and the measured source
  // rect goes stale (visible jitter with classic scrollbars).
  const sbw = innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.dataset.lb = '1'; // pauses ambient motion (e.g. the shelf loop)
  if (sbw > 0) document.documentElement.style.paddingRight = `${sbw}px`;
  sfx.tick();

  const prevFocus = document.activeElement as HTMLElement | null;
  let closing = false, armed = false;
  const arm = () => {
    if (closing) return;
    armed = true;
    // Re-measure: the source can drift while we wait (a hover lift settling,
    // an image above finishing its load), and a stale rect lands as a jump.
    const m = map(pres.getBoundingClientRect());
    twin.style.transition = 'none';
    twin.style.transform = m.t;
    twin.style.borderWidth = `${srcBorder / m.s}px`;
    twin.style.borderRadius = `${srcRadius / m.s}px`;
    // The swap: identical pixels in the identical place, same frame.
    // The twin is rastered at its (large) open size and minified by the
    // compositor down here, so at this end of the flight it reads thinner and
    // more aliased than the original — a full card can land at scale .33.
    // So commit the start state, launch the flight, and only reveal the twin
    // on the NEXT frame, by which point it is already moving: the aliased
    // raster is never painted sitting still, which is what read as a pop.
    void twin.offsetWidth;
    twin.style.transition = FLIGHT;
    lb.dataset.open = '1'; // scrim + caption + close fade in (CSS)
    twin.style.transform = 'none';
    twin.style.borderRadius = '14px';
    twin.style.borderWidth = '0px';
    twin.style.boxShadow = '0 30px 90px rgba(0,0,0,.45)';
    requestAnimationFrame(() => {
      twin.style.opacity = '1';
      shell.style.visibility = 'hidden';
    });
    q<HTMLButtonElement>(lb, '.lb-close').focus({ preventScroll: true });
  };
  // Two frames after the pixels land, so the compositor has rastered the
  // twin at its (much larger) open size before it is ever shown.
  twinReady(media).then(() => requestAnimationFrame(() => requestAnimationFrame(arm)));

  const close = () => {
    if (closing) return; closing = true;
    if (!armed) { // tapped out before it ever took off — tear down, no flight
      document.removeEventListener('keydown', onKey, true);
      delete document.documentElement.dataset.lb;
      document.dispatchEvent(new CustomEvent('lb:closed'));
      lb.remove();
      document.documentElement.style.overflow = '';
      document.documentElement.style.paddingRight = '';
      prevFocus?.focus?.({ preventScroll: true });
      if (isVideo) (el as HTMLVideoElement).play().catch(() => {});
      lbOpen = false;
      return;
    }
    sfx.tick();
    const m1 = map(pres.getBoundingClientRect()); // re-measure: layout may have shifted
    delete lb.dataset.open;
    twin.style.transform = m1.t;
    twin.style.borderRadius = `${srcRadius / m1.s}px`;
    twin.style.borderWidth = `${srcBorder / m1.s}px`;
    twin.style.boxShadow = 'none';
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      if (isVideo) {
        const sv = el as HTMLVideoElement, tv = media as HTMLVideoElement;
        sv.currentTime = tv.currentTime; sv.play().catch(() => {});
      }
      // Reveal the original under the twin. For video the overlay stays up a
      // frame or two longer, covering the source's seek back to the twin's
      // time; for an image there is nothing to wait for, and the landed twin
      // is the aliased one, so it goes in the same commit as the reveal.
      shell.style.visibility = '';
      if (!isVideo) twin.style.opacity = '0';
      // resume ambient motion (shelf loop) only once the image has landed
      delete document.documentElement.dataset.lb;
      document.dispatchEvent(new CustomEvent('lb:closed'));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        lb.remove();
        document.documentElement.style.overflow = '';
        document.documentElement.style.paddingRight = '';
        prevFocus?.focus?.({ preventScroll: true });
        lbOpen = false;
      }));
      document.removeEventListener('keydown', onKey, true);
    };
    if (dur === 0) finish();
    else {
      twin.addEventListener('transitionend', (e) => { if (e.propertyName === 'transform') finish(); });
      setTimeout(finish, dur * 1000 + 200); // safety net
    }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  q(lb, '.lb-scrim').addEventListener('click', close);
  q(lb, '.lb-close').addEventListener('click', close);
  twin.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
}

/* ---- the wild shelf: seamless auto-scroll loop ---- */
function initShelf(shelf: HTMLElement) {
  const track = q<HTMLElement>(shelf, '.track');
  const set = q<HTMLElement>(shelf, '.set');
  const pace = () => {
    const w = set.offsetWidth + 18; // one set + the gap between sets
    track.style.setProperty('--loopw', `${w}px`);
    track.style.setProperty('--loopdur', `${Math.max(20, w / 38)}s`); // ~38px/s
  };
  pace();
  window.addEventListener('resize', pace);
  shelf.querySelectorAll('img').forEach((im) => im.addEventListener('load', pace));
  // After a lightbox lands, the cursor still rests on the card it came from —
  // keep gliding and ignore hover entirely until the pointer LEAVES the
  // shelf (moving around inside it must not re-pause the loop).
  document.addEventListener('lb:closed', () => { shelf.dataset.nohover = '1'; });
  shelf.addEventListener('pointerleave', () => { delete shelf.dataset.nohover; });
  document.addEventListener('pointermove', (e) => {
    if (shelf.dataset.nohover && !shelf.contains(e.target as Node)) delete shelf.dataset.nohover;
  }, { passive: true });
}

function initLightbox(post: HTMLElement) {
  const targets = qa<HTMLImageElement | HTMLVideoElement>(post, 'figure.fig img, figure.fig video, .phones .frame video, .shelf .card img');
  targets.forEach((el) => {
    el.dataset.hot = '';
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'View larger');
    el.style.cursor = 'zoom-in';
    el.style.pointerEvents = 'auto';
    el.addEventListener('click', () => openViewer(el));
    el.addEventListener('keydown', (e: Event) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') { e.preventDefault(); openViewer(el); }
    });
  });
}

/* ---- the penciled pilot sketch ---- */
function initSketch(sk: HTMLElement) {
  // Mark that JS is driving this: the markup renders fully visible, so a
  // failed/blocked observer can never hide real content (see Signoff).
  sk.dataset.armed = '1';
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) { sk.dataset.run = '1'; io.disconnect(); }
  }), { threshold: 0.45 });
  io.observe(sk);
  sk.querySelector('[data-again]')?.addEventListener('click', () => {
    delete sk.dataset.run;
    void sk.offsetWidth; // restart every animation from zero
    sk.dataset.run = '1';
    sfx.tick();
  });
}

export function initGadgets(root: ParentNode) {
  qa(root, '[data-player]').forEach(initPlayer);
  qa(root, '[data-sketch]').forEach(initSketch);
  qa(root, '[data-shelf]').forEach(initShelf);
  initLightbox(root as HTMLElement);
}
