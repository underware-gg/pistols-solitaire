# Pistols Solitaire client

Next.js 16 (App Router) + React 19 + TypeScript.

```bash
pnpm install        # from the repo root
pnpm dev            # http://localhost:3000
pnpm build          # production build
pnpm start          # serve the build
pnpm check-types    # tsc --noEmit
pnpm lint           # biome check
pnpm format         # biome check --write
```

Pages live in `src/app/`. `@/*` resolves to `src/*`, `@/assets/*` to `public/assets/*`.

Styling is Tailwind 4 — all of it in `src/styles/main.css` (tokens in `@theme`, no `tailwind.config.*`). Icons come from `lucide-react`.

Read [`../specs/CODING_STYLE.md`](../specs/CODING_STYLE.md) and [`../specs/NEXTJS_DATA_FLOW.md`](../specs/NEXTJS_DATA_FLOW.md) before writing code here.

Shared dependency versions come from the `catalog:` block in the root `pnpm-workspace.yaml` — bump them there.
