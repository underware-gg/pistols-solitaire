import type { NextConfig } from 'next';

//
// `NEXT_DIST_DIR` lets a second dev server run alongside the first: Next.js locks one dev
// server per build dir, so `pnpm dev:claude` points at `.next-claude` instead of `.next`
// and leaves the `pnpm dev` instance on :3000 untouched.
//
const nextConfig: NextConfig = {
  //
  // Dev only. Next.js blocks `/_next/*` requests whose Origin isn't localhost, which
  // rejects the HMR websocket upgrade when the app is opened at the machine's LAN IP
  // (`ws://192.168.x.x:3000/_next/webpack-hmr` → 403, hot reload dies and the page
  // force-reloads after 25 retries). Allow private ranges so any DHCP address works.
  //
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],

  //
  // Image optimization off, app-wide: `next/image` serves the file as authored instead of routing it
  // through `/_next/image`. This is a game client that ships its own art — the card faces, backs and
  // logo are hand-made PNGs at the size they are meant to be seen, and the engine already rasterizes
  // every card itself (`engine/card-art.ts`) without going near `next/image`. What the optimizer was
  // buying on top of that was resizing we don't need, in exchange for a route between every asset and
  // the page that can answer 404 or 500 — and a `remotePatterns` allowlist to maintain the day a
  // collection's own art is shown.
  //
  // **What it does not turn off is lazy loading**, which is still `next/image`'s default and still
  // needs an IntersectionObserver — so `next/image` remains the wrong tool for anything drawn over
  // the canvas, where that observer cannot be relied on to ever fire (`ui/NotificationBadge`).
  //
  // The cost is that an oversized source file is now served at its real weight: keep art in
  // `public/` close to the size it renders at.
  //
  images: { unoptimized: true },

  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
