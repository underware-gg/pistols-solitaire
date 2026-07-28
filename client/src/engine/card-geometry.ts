import * as THREE from 'three';

//
// The playing card, built procedurally: a rounded rectangle extruded to a card's thickness,
// with its faces cut into three material groups — front, back, and the paper edge around the
// rim — so each takes its own material and its own texture.
//
// **One geometry per aspect ratio, shared by every card of that shape.** Cards differ only in their
// front texture, so a table never needs more than one; `cardGeometry` memoizes per aspect because
// the app deals two different decks — Torii's 5:7 token art and the 2:3 painted deck in
// `public/deck/` — and stretching either onto the other's mesh is visible immediately. Nothing here
// needs a browser: the module is import-safe on the server.
//

/**
 * Torii token art: `public/cards/card_back.png` is 2996×4197 and the token images are 771×1080 —
 * both 5:7, so the mesh, the back and the fronts all agree.
 */
export const TOKEN_ASPECT = 5 / 7;
/** The standard 52-card deck in `public/deck/`: every face and back is 1024×1536, i.e. exactly 2:3. */
export const STANDARD_ASPECT = 2 / 3;

/** The default shape, kept as the name the token table has always used. */
export const CARD_ASPECT = TOKEN_ASPECT;

/** The card is one world unit tall; every distance on every table is expressed in card heights. */
export const CARD_HEIGHT = 1;
/** Width of a default-aspect card. For any other shape use `cardWidth(aspect)`. */
export const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT;
export const CARD_THICKNESS = 0.008;

/** How wide a card of the given aspect is, in card heights. */
export const cardWidth = (aspect = CARD_ASPECT): number => CARD_HEIGHT * aspect;

/** Card stock, for a face whose art has not arrived (or does not fill it). */
export const CARD_PAPER_COLOR = '#f2e7d3';
/**
 * The cut edge around the rim — **the one knob for how a stack of cards reads**, and deliberately
 * darker than the stock it is cut from. A real deck's sides are shaded by the cards either side of
 * them; ours are `CARD_THICKNESS` apart with nothing to occlude them, so paper-coloured rims lit
 * from the key light turn a stack into a bright block. Darkening the rim is what puts the shadow
 * back between the cards.
 */
export const CARD_EDGE_COLOR = '#f4ddaeff';
/** A face that *has* art: white, so the material tints the texture by nothing at all. */
export const CARD_ART_TINT = '#ffffff';

/**
 * The card's corner, in card units — exported so anything card-shaped rounds off the same way.
 * Proportional to the card's *width*, so a narrower card is not more rounded than a wide one.
 */
export const cardCornerRadius = (aspect = CARD_ASPECT): number => cardWidth(aspect) * 0.06;
/** The default-aspect corner. Kept as a constant for the token table's own call sites. */
export const CARD_CORNER_RADIUS = cardCornerRadius();
const CORNER_SEGMENTS = 6;

/** Material slot per face — the index into the card mesh's `material` array. */
export const CARD_FACE = { front: 0, back: 1, edge: 2 } as const;

//
// The card outline, centered on the origin in the XY plane.
//
const cardShape = (width: number, height: number, radius: number): THREE.Shape => {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
  shape.lineTo(x + width, y + height - radius);
  shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
  shape.lineTo(x + radius, y + height);
  shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
  shape.lineTo(x, y + radius);
  shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
  return shape;
};

/**
 * A card mesh's geometry: extruded, centered on the origin, facing +Z, with `CARD_FACE`
 * groups and face UVs that map a card image over the whole face.
 */
export const buildCardGeometry = (
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  thickness = CARD_THICKNESS,
  radius = width * 0.06,
): THREE.BufferGeometry => {
  const geometry = new THREE.ExtrudeGeometry(cardShape(width, height, radius), {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: CORNER_SEGMENTS,
  });
  geometry.translate(0, 0, -thickness / 2); // sit the card on its own middle, not on a face

  //
  // ExtrudeGeometry emits exactly two groups — both caps in one, then the side walls
  // (three/src/geometries/ExtrudeGeometry.js) — so the front and the back share a material.
  // Re-cut that first group down the middle: the caps have the same triangle count, and
  // which half is which is read off the vertex z rather than assumed from three's ordering.
  //
  const [caps, sides] = geometry.groups;
  const half = caps.count / 2;
  const position = geometry.attributes.position;
  const isFrontVertex = (index: number) => position.getZ(index) > 0;

  geometry.clearGroups();
  const first = isFrontVertex(caps.start) ? CARD_FACE.front : CARD_FACE.back;
  geometry.addGroup(caps.start, half, first);
  geometry.addGroup(
    caps.start + half,
    half,
    first === CARD_FACE.front ? CARD_FACE.back : CARD_FACE.front,
  );
  geometry.addGroup(sides.start, sides.count, CARD_FACE.edge);

  //
  // Extrusion UVs are raw shape coordinates, so normalize the caps over the card's box.
  //
  // Both caps take the same U; the back takes V **inverted**, i.e. its art is printed upside down
  // relative to the front. That is not a hack, it is what a card whose faces turn about its
  // horizontal axis needs: the back is seen from the other side (one mirror) *and* the card has been
  // turned end over end to show it (a second mirror), and two mirrors leave the art unmirrored but
  // upside down. Inverting V here cancels that, so a card reads upright in both flat poses — back up
  // in a deck, art up in the grid — and the flip stays a single-number sweep of the tilt.
  //
  const uv = geometry.attributes.uv;
  const capEnd = caps.start + caps.count;
  for (let index = 0; index < position.count; index++) {
    if (index < caps.start || index >= capEnd) {
      uv.setXY(index, 0, 0); // the rim is a flat colour — nothing samples it
      continue;
    }
    const u = (position.getX(index) + width / 2) / width;
    const v = (position.getY(index) + height / 2) / height;
    uv.setXY(index, u, isFrontVertex(index) ? v : 1 - v);
  }
  uv.needsUpdate = true;

  return geometry;
};

//
// One geometry per shape, built on first use and kept for the session. Keyed on the aspect alone
// because height and thickness are the same for every card in the app — a table that wants thicker
// cards should change `CARD_THICKNESS`, not build a second geometry behind this cache's back.
//
const geometries = new Map<number, THREE.BufferGeometry>();

/** The shared card geometry for a given aspect ratio. */
export const cardGeometry = (aspect = CARD_ASPECT): THREE.BufferGeometry => {
  const cached = geometries.get(aspect);
  if (cached) return cached;
  const geometry = buildCardGeometry(
    cardWidth(aspect),
    CARD_HEIGHT,
    CARD_THICKNESS,
    cardCornerRadius(aspect),
  );
  geometries.set(aspect, geometry);
  return geometry;
};

/** The token table's geometry, by the name it has always had. */
export const CARD_GEOMETRY = cardGeometry(TOKEN_ASPECT);
