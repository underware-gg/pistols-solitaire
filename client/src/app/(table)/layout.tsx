import type { ReactNode } from 'react';
import { DecksScene } from '@/components/pages/decks/DecksScene';

//
// The table is mounted here, above both deck routes, so a WebGL canvas is not torn down and rebuilt
// every time a deck is opened or closed. See `DecksScene`.
//
// **Why a route group**: `/decks` and `/deck/<slug>` are not sibling segments, so there is no shared
// piece of URL to hang this layout from. `(table)` is that shared parent without appearing in any
// path — both routes live under it, so navigating between them keeps this layout, and the canvas
// inside it, mounted.
//
export default function TableLayout({ children }: { children: ReactNode }) {
  return <DecksScene>{children}</DecksScene>;
}
