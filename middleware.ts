/* Vercel Routing Middleware — password gate for the Clips case study.
   Runs at the platform edge (before cache), so it works with the static
   Astro build. The password lives in the CLIPS_PASSWORD env var; the
   cookie stores its SHA-256 so the raw password is never sent back.
   If CLIPS_PASSWORD is unset the gate opens — a missing env var should
   never lock the whole site out. */
import { next } from '@vercel/functions';

const COOKIE = 'clips_key';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_DEST = '/clips';

async function tokenFor(password: string) {
  const bytes = new TextEncoder().encode(`clips::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only same-origin paths, so ?next= can't be used as an open redirect. */
function safeDest(raw: string | null) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_DEST;
  return raw;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const password = process.env.CLIPS_PASSWORD;
  if (!password) return next();

  const expected = await tokenFor(password);
  const unlocked = (request.headers.get('cookie') ?? '')
    .split(';')
    .some((c) => c.trim() === `${COOKIE}=${expected}`);

  if (url.pathname === '/unlock') {
    if (request.method !== 'POST') return next();
    const form = await request.formData();
    const dest = safeDest(String(form.get('next') ?? DEFAULT_DEST));
    const given = String(form.get('password') ?? '');
    if ((await tokenFor(given)) !== expected) {
      const back = new URL(`/unlock?e=1&next=${encodeURIComponent(dest)}`, url);
      return Response.redirect(back, 303);
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL(dest, url).toString(),
        'Set-Cookie': `${COOKIE}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
      },
    });
  }

  if (unlocked) return next();
  const gate = new URL(`/unlock?next=${encodeURIComponent(url.pathname)}`, url);
  return Response.redirect(gate, 307);
}

export const config = {
  runtime: 'edge',
  matcher: ['/clips', '/clips/:path*', '/media/clips/:path*', '/unlock'],
};
