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

  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
