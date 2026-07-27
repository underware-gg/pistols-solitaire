import type { ReactNode } from 'react';
import { BagScene } from '@/components/pages/bag/BagScene';

//
// The table is mounted here, above both `/bag` routes, so a WebGL canvas is not torn down
// and rebuilt every time a deck is opened or closed. See `BagScene`.
//
export default function BagLayout({ children }: { children: ReactNode }) {
  return <BagScene>{children}</BagScene>;
}
