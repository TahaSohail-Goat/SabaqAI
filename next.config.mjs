// Supabase's own REST/Auth endpoint is the only cross-origin destination the browser
// itself ever calls (SocialAuthButtons' supabase.auth.signInWithOAuth, and the browser
// client generally) — Gemini/Groq/Jina all run server-side only, behind /api/*, so they
// never need to appear in a browser-enforced CSP.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// script-src stays 'unsafe-inline' rather than a strict hash/nonce allowlist — verified live
// that Next.js 16's own App Router RSC streaming injects several inline bootstrap scripts
// per page (not just this app's one theme-flash script in layout.tsx), each containing
// request-specific payload data with a different hash on every load. A static hash list
// can't cover that, and per CSP2+ spec, having ANY hash/nonce source present makes
// browsers ignore 'unsafe-inline' entirely rather than falling back to it — so the two
// approaches can't be combined; it's one or the other. Doing this properly needs Next's
// documented per-request nonce recipe (threaded through middleware into layout.tsx), which
// is real follow-up work, not something to get subtly wrong here. This is a real reduction
// in XSS defense-in-depth — mitigated by the fact that this app has no
// dangerouslySetInnerHTML on user/AI-generated content anywhere and no markdown renderer
// (see SESSION_HANDOFF.md), so there's no known injection point for it to actually catch.
// Every other directive below (connect-src, frame-ancestors, object-src, base-uri,
// form-action) stays fully strict and independently effective regardless of this one.
// React dev mode uses eval() for stack-trace reconstruction (never in production builds —
// react-dom says so in the console warning itself), so script-src needs unsafe-eval only
// in dev. Keeping it out of the production policy is what actually matters.
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Supabase-hosted origin needed here too, not just connect-src — user avatars are plain
  // <img src> tags pointing at the public avatars bucket (see settings/page.tsx, Sidebar.tsx),
  // which the browser's own img-src check blocks independently of connect-src.
  `img-src 'self' data: blob: ${supabaseUrl}`,
  "font-src 'self'",
  // Turbopack's dev-mode hot-reload client connects over its own ws:// socket — not covered
  // by 'self' in every browser's CSP implementation, dev-only, harmless (no HMR socket exists
  // in a production build at all).
  `connect-src 'self' ${supabaseUrl}${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
  // /ask's document reader embeds the real source PDF straight from Supabase Storage —
  // default-src's 'self' doesn't cover that cross-origin frame on its own.
  `frame-src 'self' ${supabaseUrl}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // self: voice input (MediaRecorder) needs the mic; everything else this app doesn't use.
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=()' },
  // No-op over plain http (dev); only takes effect once this is actually served over https.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
