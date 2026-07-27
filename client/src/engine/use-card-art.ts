'use client';

import { useEffect, useState } from 'react';
import type * as THREE from 'three';
import { type CardArtOptions, loadCardArt } from '@/engine/card-art';

//
// One card's art as a texture, or `undefined` until it is ready — the card renders its blank
// stock in the meantime and reveals itself when the texture lands.
//
// This is the one fetch in the app that does not go through react-query, and deliberately so:
// a texture is a GPU resource that has to be disposed on eviction, which is exactly what the
// LRU in `card-art.ts` does and what a query cache cannot. See `specs/NEXTJS_DATA_FLOW.md`
// §1 — the prohibition there is on fetching *app data* with `useEffect`, not on loading images.
//

export const useCardArt = (
  url?: string,
  { height, background, aspect, pixelated, pin }: CardArtOptions = {},
): THREE.Texture | undefined => {
  const [art, setArt] = useState<THREE.Texture>();

  useEffect(() => {
    if (!url) {
      setArt(undefined);
      return;
    }
    let cancelled = false;
    loadCardArt(url, { height, background, aspect, pixelated, pin })
      .then(texture => {
        if (!cancelled) setArt(texture);
      })
      .catch(error => console.warn(error));
    return () => {
      cancelled = true;
    };
    // Every option is part of the cache key, so every option belongs in the dependencies.
  }, [url, height, background, aspect, pixelated, pin]);

  return art;
};
