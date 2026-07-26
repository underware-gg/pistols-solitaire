import * as THREE from 'three';

//
// The playing card, built procedurally: a rounded rectangle extruded to a card's thickness,
// with its faces cut into three material groups — front, back, and the paper edge around the
// rim — so each takes its own material and its own texture.
//
// One geometry is shared by every card on the table. Cards differ only in their front
// texture, so there is never a reason to build a second one, and nothing here needs a
// browser: the module is import-safe on the server.
//

/**
 * Card proportions. `public/cards/card_back.png` is 2996×4197 and the token art Torii serves
 * is 771×1080 — both 5:7, so the mesh, the back and the fronts all agree.
 */
export const CARD_ASPECT = 5 / 7;
/** The card is one world unit tall; every distance on the table is expressed in card heights. */
export const CARD_HEIGHT = 1;
export const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT;
export const CARD_THICKNESS = 0.008;

/** Card stock, for the rim and for a face whose art has not arrived (or does not fill it). */
export const CARD_PAPER_COLOR = '#f2e7d3';
/** A face that *has* art: white, so the material tints the texture by nothing at all. */
export const CARD_ART_TINT = '#ffffff';

const CORNER_RADIUS = CARD_WIDTH * 0.06;
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
): THREE.BufferGeometry => {
  const geometry = new THREE.ExtrudeGeometry(cardShape(width, height, CORNER_RADIUS), {
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

/** The one card geometry the whole table shares. */
export const CARD_GEOMETRY = buildCardGeometry();
