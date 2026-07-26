'use client';

import { useEffect, useState } from 'react';
import type * as THREE from 'three';
import { loadCardArt } from '@/lib/card-art';

//
// One card's art as a texture, or `undefined` until it is ready — the card renders its blank
// stock in the meantime and reveals itself when the texture lands.
//
// This is the one fetch in the app that does not go through react-query, and deliberately so:
// a texture is a GPU resource that has to be disposed on eviction, which is exactly what the
// LRU in `lib/card-art.ts` does and what a query cache cannot. See `specs/NEXTJS_DATA_FLOW.md`
// §1 — the prohibition there is on fetching *app data* with `useEffect`, not on loading images.
//

export const useCardArt = (
  url?: string,
  { background, pin = false }: { background?: string; pin?: boolean } = {},
): THREE.Texture | undefined => {
  const [art, setArt] = useState<THREE.Texture>();

  useEffect(() => {
    if (!url) {
      setArt(undefined);
      return;
    }
    let cancelled = false;
    loadCardArt(url, { background, pin })
      .then(texture => {
        if (!cancelled) setArt(texture);
      })
      .catch(error => console.warn(error));
    return () => {
      cancelled = true;
    };
  }, [url, background, pin]);

  return art;
};
