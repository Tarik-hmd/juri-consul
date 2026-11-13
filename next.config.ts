import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Security baseline (Phase 0 skeleton, kept through Phase 18). The
// per-request nonce CSP was evaluated in Phase 18 and SKIPPED (Next 16
// renamed middleware.ts to proxy.ts, and Turbopack builds fail file tracing
// for any root middleware/proxy — see D36); the static skeleton stays until
// that work is revisited. Private routes get Cache-Control: no-store.
const isProduction = process.env.NODE_ENV === "production";

// Next.js ships inline bootstrap scripts + flight data: without
// 'unsafe-inline' the browser blocks hydration and every form silently falls
// back to a native GET submit (credentials end up in the URL, actions never
// run). Dev additionally needs 'unsafe-eval' for the overlay/Turbopack.
const scriptSrc = isProduction
  ? "'self' 'unsafe-inline'"
  : "'self' 'unsafe-eval' 'unsafe-inline'";

// upgrade-insecure-requests is production-only: in dev it rewrites
// subresource URLs to https:// on non-localhost origins (e.g. LAN IPs),
// and the plain-HTTP dev server then fails every request with
// ERR_SSL_PROTOCOL_ERROR (unstyled page). Localhost is exempt by browsers,
// which is why this only bites IP-based dev URLs.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "media-src https:",
  "frame-src 'self' https://www.youtube-nocookie.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // HSTS only in production: localhost dev runs over plain HTTP.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

// Server Actions accept same-origin posts; explicitly allowlist the
// deployment host too (parsed defensively so builds never crash on it).
const allowedOrigins = ((): string[] | undefined => {
  try {
    const raw = process.env["APP_URL"];
    if (raw === undefined || raw === "") {
      return undefined;
    }
    const host = new URL(raw).host;
    return host === "" ? undefined : [host];
  } catch {
    return undefined;
  }
})();

// Cross-origin callers of the PUBLIC api (white-label embeds, external
// sites) need CORS. Single exact origin, no credentials (public endpoints
// are cookieless). Falls back to the production URL when APP_URL is unset.
const corsOrigin = ((): string => {
  try {
    const raw = process.env["APP_URL"];
    if (raw !== undefined && raw !== "") {
      return new URL(raw).origin;
    }
  } catch {
    // fall through to the default below
  }
  return "https://juriconsul.netlify.app";
})();

const corsHeaders = [
  { key: "Access-Control-Allow-Origin", value: corsOrigin },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type" },
  { key: "Access-Control-Max-Age", value: "86400" },
];

const nextConfig: NextConfig = {
  // Dev origins beyond localhost (LAN IP testing, loopback IP, ngrok
  // tunnels): without these, Next blocks HMR + Server Action requests from
  // those origins and forms silently fall back to native GET submits.
  // NOTE: free ngrok subdomains rotate on every restart — update the host
  // below (or reserve a static ngrok domain) whenever the tunnel URL changes.
  // Production unaffected.
  allowedDevOrigins: [
    "172.17.32.1",
    "127.0.0.1",
    "giveaway-reformer-blah.ngrok-free.dev",
  ],
  // A stray package-lock.json higher up the tree confuses Turbopack's root
  // detection; pin the root explicitly.
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      // Brand uploads allow 2 MB files, magnet source PDFs 5 MB (validated
      // server-side on top). Page PDFs use a Route Handler, which is not
      // subject to this cap.
      bodySizeLimit: "6mb",
      ...(allowedOrigins !== undefined ? { allowedOrigins } : {}),
    },
  },
  // Standalone output for the portable Docker image; Netlify ignores it.
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Private surfaces are never cached anywhere.
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/api/internal/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      // Public API only: preflight + actual responses carry CORS.
      // /api/internal/* and /api/auth/* stay same-origin by design.
      {
        source: "/api/public/:path*",
        headers: corsHeaders,
      },
    ];
  },
};

export default nextConfig;
