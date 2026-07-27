import { SolitairePage } from '@/components/pages/solitaire/SolitairePage';

//
// The `/solitaire` route. A mount point and nothing else — all markup lives in `components/`.
//
// The canvas is mounted by the *page*, unlike `/bag`, which needs a layout: `/bag` and `/bag/<slug>` are
// sibling route segments, so Next unmounts one page component to mount the other and a `<Canvas>` in the
// page would lose its WebGL context on every deck opened. `/solitaire` is a single route with no
// children, so there is nothing to survive. **If game selection ever becomes `/solitaire/<game>`, that is
// the moment to move `SolitaireScene` into a `layout.tsx`** — and the reason is the one above.
//
export default function Page() {
  return <SolitairePage />;
}
