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

/**
 * The art, plus whether the question has been *answered*. `settled` is the half a card that deals
 * face down needs: `art` alone cannot tell "still coming" from "there is none", and a token the
 * indexer 404s would stay face down forever waiting for a texture that is never arriving.
 */
export type CardArtState = {
  art?: THREE.Texture;
  /** The art has arrived, or is known not to be coming (no url, or the fetch gave up). */
  settled: boolean;
};

const PENDING: CardArtState = { art: undefined, settled: false };
const NOTHING: CardArtState = { art: undefined, settled: true };

/** {@link useCardArt}, with the loading state as well — see {@link CardArtState}. */
export const useCardArtState = (
  url?: string,
  { height, background, aspect, pixelated, pin }: CardArtOptions = {},
): CardArtState => {
  const [state, setState] = useState<CardArtState>(PENDING);

  useEffect(() => {
    if (!url) {
      setState(NOTHING);
      return;
    }
    let cancelled = false;
    setState(PENDING);
    loadCardArt(url, { height, background, aspect, pixelated, pin })
      .then(texture => {
        if (!cancelled) setState({ art: texture, settled: true });
      })
      .catch(error => {
        console.warn(error);
        // A card whose art is never coming is settled too, and shows its blank stock.
        if (!cancelled) setState(NOTHING);
      });
    return () => {
      cancelled = true;
    };
    // Every option is part of the cache key, so every option belongs in the dependencies.
  }, [url, height, background, aspect, pixelated, pin]);

  return state;
};

export const useCardArt = (url?: string, options: CardArtOptions = {}): THREE.Texture | undefined =>
  useCardArtState(url, options).art;
