import * as THREE from 'three';
import { CARD_ASPECT, CARD_PAPER_COLOR } from '@/lib/card-geometry';

//
// Card art as a WebGL texture: loaded, rasterized onto card stock, cached, and disposed.
//
// Both sources take the same path. The back is a PNG in `public/cards/`; the front is the
// image Torii serves for the token (`tokenImageUrl()`), which for a Pistols token is a ~750KB
// SVG with the artwork embedded in it. Neither can go straight to three's `TextureLoader`:
// `card_back.png` is 2996×4197 (~50MB of VRAM at full size) and an SVG has no raster size at
// all. So every image is drawn into a canvas at the size the table actually needs and
// uploaded from there — `drawImage` with explicit dimensions rasterizes an SVG at exactly
// that resolution.
//
// Drawing also normalizes the shape: the canvas is always a 5:7 card face and the art is
// centered inside it over card stock, so a collection whose art is square or 4:3 gets
// letterboxed onto paper instead of stretched across the mesh. **What that letterbox is filled
// with is the collection's own `background_color`** (`ContractsProvider`) rather than cream
// paper, which is the whole difference between a square token reading as its artist intended and
// reading as a stamp on the wrong card. It is part of the cache key, because two collections can
// ask for the same art on different stock and must not share an entry.
//
// The cache is an LRU with a hard cap, because a 500-card deck paged end to end would
// otherwise upload gigabytes of texture and never let go. The cap is comfortably more than
// one page, so a texture still on the table can never be evicted under it. This is also why
// card art is not a react-query query: nothing there disposes a GPU resource on eviction.
//
// Every fetch is **retried, and validated before it is believed** — Torii's image endpoint answers
// 200 with an empty or truncated body often enough that most cards need a second ask. See
// `ART_CONCURRENCY` for the mechanism and the measurements; it is what the blank cards were.
//

/**
 * The card backs, from `public/cards/`. Pistols' own collections are printed on the Pistols back;
 * everything else on the table is a guest, and carries the plain one.
 */
export const CARD_BACK_URL = '/cards/card_back.png';
export const CARD_BACK_ALT_URL = '/cards/card_back2.png';

/** The game whose cards use {@link CARD_BACK_URL} — `contracts.json`'s `game`, not a display name. */
const HOME_GAME = 'pistols';

/**
 * Which back a collection's cards are printed on, by its `game`.
 *
 * There are exactly two, so both are loaded and pinned up front (`CardTable`) and this only picks
 * between them — a per-collection back would want a map in `contracts.json` instead.
 */
export const cardBackUrl = (game?: string): string =>
  game === HOME_GAME ? CARD_BACK_URL : CARD_BACK_ALT_URL;

/**
 * Height in texels every card face is rasterized to; the width follows from `CARD_ASPECT`.
 *
 * **This is a VRAM budget, not a quality dial**, and it trades against `CACHE_LIMIT`: a face costs
 * `height × height × CARD_ASPECT × 4` bytes, ~1.7MB at 768, plus a third again for mipmaps. It is
 * sized for the *zoomed* card, the only one seen large — that fills ~77% of the viewport height, so
 * 768 is at or above 1:1 up to a ~1000px-tall window and goes slightly soft above it. Raising it is
 * a squared cost, so drop `CACHE_LIMIT` to match if you do.
 */
export const CARD_ART_HEIGHT = 768;

/**
 * How many rasterized faces to keep — **three grid pages**, so paging back and forth across a big
 * collection is instant instead of re-fetching through Torii's slow image endpoint. Must stay
 * comfortably above one page (20), or eviction would dispose a texture still on the felt.
 */
const CACHE_LIMIT = 60;

/** Fraction of the card face the art is drawn across, leaving a paper margin. */
const ART_INSET = 1;

type CacheEntry = {
  texture: Promise<THREE.Texture>;
  /** Pinned entries (the card back) are never evicted — every card on the table uses them. */
  pinned: boolean;
};

const cache = new Map<string, CacheEntry>();

//
// Fetching: retried, because Torii's image endpoint hands out corrupt files.
//
// `/static/<contract>/<token>/image` rebuilds the file on **every** request — the SVG branch of
// `torii/crates/server/src/artifacts.rs` never writes the `image.hash` that `check_image_hash`
// looks for, so `should_fetch` is always true — and then serves it by `File::create` (which
// truncates) → `write_all` → reopen and read back, with no flush and no lock. So the read races the
// write that request just issued, as well as any other request for the same token, and the loser
// gets **HTTP 200 with an empty (or short) body**. That is what the blank cards were: an empty
// response is not an error the `<img>` layer can retry, it is a successful load of nothing.
//
// The fix is to notice it and ask again **with the HTTP cache bypassed** — the *same* url succeeds
// on the next attempt, because by then the previous write has landed. The cache bypass is not
// optional and is the subtler half of this: see `fetchArt`.
//
// Measured against the live mainnet indexer, dealing a page of twenty: the total number of requests
// is ~34 (≈1.7 per card) and is **flat in the concurrency**, while wall time falls from 13.5s at
// one-at-a-time to ~2.5s at six. So throttling buys the indexer nothing and costs the player ten
// seconds; the retry is the whole fix, and the limit below is only there to keep a 500-card
// collection from opening 500 sockets.
//
/** How many card images may be in flight at once. A burst limit, nothing more — see above. */
const ART_CONCURRENCY = 6;

/**
 * Attempts per image. The observed worst case is 2 (one request to make the file, one to read it
 * intact); the rest is headroom for a genuinely unlucky token.
 */
const ART_ATTEMPTS = 6;
/** Pause before retrying, multiplied by the attempt number. */
const ART_RETRY_MS = 120;

/** Bytes of the tail to check for a closing tag; an SVG cut short still parses, and draws blank. */
const TRUNCATION_TAIL = 64;

let inFlight = 0;
const waiting: (() => void)[] = [];

const acquire = (): Promise<void> => {
  if (inFlight < ART_CONCURRENCY) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    waiting.push(() => {
      inFlight += 1;
      resolve();
    });
  });
};

const release = () => {
  inFlight -= 1;
  waiting.shift()?.();
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** An answer the indexer will keep giving — a token it has no image for. Asking again is waste. */
class PermanentArtError extends Error {}

/**
 * One attempt at the bytes. Both corruption modes look like success at the HTTP level, so they are
 * checked here: an empty body, and an SVG whose closing tag never made it.
 *
 * **A retry must bypass the HTTP cache, or it is not a retry at all.** Torii serves the image with
 * `cache-control: public, max-age=3600`, so the browser caches the empty body *as a successful
 * response* and hands the identical 0-byte answer to every later request for that url — for an
 * hour, across reloads. Verified in Chrome: six requests at once → six empty, then two plain
 * retries → still empty, then one `cache: 'reload'` → the full 653KB. `reload` also *replaces* the
 * poisoned entry, so it fixes the url for everything that asks afterwards rather than only for us.
 * (This is why node measurements of this endpoint look better than the browser: `node:fetch` has
 * no HTTP cache to poison.)
 */
const fetchArt = async (url: string, attempt: number): Promise<Blob> => {
  const response = await fetch(url, attempt === 1 ? undefined : { cache: 'reload' });
  // 404 is the honest answer for a token the indexer has no image for (verified against mainnet:
  // ids past the collection's supply). Retrying it burns every attempt to reach the same answer.
  if (response.status >= 400 && response.status < 500)
    throw new PermanentArtError(`Card art ${response.status}: ${url}`);
  if (!response.ok) throw new Error(`Card art ${response.status}: ${url}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error(`Card art served an empty body: ${url}`);
  if (blob.type.includes('svg')) {
    const tail = await blob.slice(-TRUNCATION_TAIL).text();
    if (!tail.includes('</svg>')) throw new Error(`Card art was served truncated: ${url}`);
  }
  return blob;
};

/** The bytes, however many attempts the indexer needs to serve them whole. */
const fetchArtWithRetries = async (url: string): Promise<Blob> => {
  let failure: unknown;
  for (let attempt = 1; attempt <= ART_ATTEMPTS; attempt++) {
    await acquire();
    try {
      return await fetchArt(url, attempt);
    } catch (error) {
      failure = error;
    } finally {
      release();
    }
    if (failure instanceof PermanentArtError) break;
    if (attempt < ART_ATTEMPTS) await sleep(ART_RETRY_MS * attempt);
  }
  throw failure;
};

/**
 * The bytes as a decoded image. The blob goes through an object URL rather than the network a
 * second time — which also means no `crossOrigin` dance and no chance of a tainted canvas.
 */
const decodeArt = async (url: string): Promise<HTMLImageElement> => {
  const blob = await fetchArtWithRetries(url);
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Card art failed to decode: ${url}`));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

//
// Draw the image onto a card-shaped canvas and upload that as the texture. The token SVGs
// carry a viewBox and no width/height, so the browser reports its own default object size for
// them — the ratio survives, which is all this needs, and anything degenerate falls back to
// the card's own ratio.
//
const rasterize = async (
  url: string,
  height: number,
  background: string,
): Promise<THREE.Texture> => {
  const image = await decodeArt(url);

  const canvas = document.createElement('canvas');
  canvas.height = height;
  canvas.width = Math.round(height * CARD_ASPECT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Card art needs a 2D context');
  context.imageSmoothingQuality = 'high';
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const ratio =
    image.naturalWidth > 0 && image.naturalHeight > 0
      ? image.naturalWidth / image.naturalHeight
      : CARD_ASPECT;
  const scale = Math.min(canvas.width / ratio, canvas.height) * ART_INSET;
  const width = scale * ratio;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - scale) / 2, width, scale);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // the renderer clamps this to the device maximum
  return texture;
};

//
// Oldest first, so deleting from the front of the Map drops the least recently used.
//
const evict = () => {
  for (const [key, entry] of cache) {
    if (cache.size <= CACHE_LIMIT) return;
    if (entry.pinned) continue;
    cache.delete(key);
    entry.texture.then(texture => texture.dispose()).catch(() => {});
  }
};

/** The texture for one card face, rasterized on first use and cached by url, size and stock. */
export const loadCardArt = (
  url: string,
  { height = CARD_ART_HEIGHT, background = CARD_PAPER_COLOR, pin = false } = {},
): Promise<THREE.Texture> => {
  const key = `${url}@${height}@${background}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key); // re-inserting moves it to the most-recently-used end
    cache.set(key, cached);
    return cached.texture;
  }

  const entry: CacheEntry = {
    pinned: pin,
    texture: rasterize(url, height, background).catch(error => {
      cache.delete(key); // a failure is not cached — the next card that needs it retries
      throw error;
    }),
  };
  cache.set(key, entry);
  evict();
  return entry.texture;
};
