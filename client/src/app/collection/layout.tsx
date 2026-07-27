import type { ReactNode } from 'react';
import { CollectionScene } from '@/components/pages/collection/CollectionScene';

//
// The table is mounted here, above both `/collection` routes, so a WebGL canvas is not torn down
// and rebuilt every time a deck is opened or closed. See `CollectionScene`.
//
export default function CollectionLayout({ children }: { children: ReactNode }) {
  return <CollectionScene>{children}</CollectionScene>;
}
