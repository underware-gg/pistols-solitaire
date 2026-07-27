import * as THREE from 'three';
import { CARD_ASPECT, CARD_CORNER_RADIUS, CARD_HEIGHT } from '@/lib/card-geometry';

//
// The empty slot: a card-shaped dashed outline, for a deck with no cards left in it.
//
// **It is a texture on a plane in the scene, not a div over the canvas**, and that is the whole
// decision here. drei's `<Html>` renders into a CSS layer above the *entire* renderer with no depth
// sorting, so an outline drawn that way would paint over every card that passes over the pile —
// including the zoomed card, which fills the frame from the middle of the table outwards. An empty
// slot has to be behind them, so it is geometry.
//
// It is a canvas texture rather than a line loop because WebGL clamps line width to 1px on every
// desktop driver, and this border is meant to be thick. A canvas already has thick, dashed and
// rounded (`lineWidth` + `setLineDash` + `roundRect`), which is the same set of knobs the CSS
// version of this would use.
//

/** Texels down the slot; the width follows from `CARD_ASPECT`. It is one flat shape, so this is plenty. */
const TEXTURE_HEIGHT = 512;
/** Border thickness, in card heights — "thick", i.e. read as a drawn edge and not as a hairline. */
const BORDER_WIDTH = 0.017;
/** Dash and gap, in border widths. */
const DASH = 2.6;
const GAP = 2;
const COLOR = '#ffffff';

let cached: THREE.CanvasTexture | undefined;

/**
 * The shared slot texture: white dashes on transparent, built on first use and kept for the
 * session (every empty deck on the table draws the same one, like `CARD_GEOMETRY`).
 */
export const cardPlaceholderTexture = (): THREE.CanvasTexture => {
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.height = TEXTURE_HEIGHT;
  canvas.width = Math.round(TEXTURE_HEIGHT * CARD_ASPECT);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('The card placeholder needs a 2D context');

  // Card units are card heights, and the canvas is one card tall — so this is the scale factor.
  const perCard = TEXTURE_HEIGHT / CARD_HEIGHT;
  const width = BORDER_WIDTH * perCard;
  // The stroke straddles its path, so the path is inset by half a border to keep it on the canvas,
  // and the corner radius follows it in (which is what keeps the corners concentric with a card's).
  const radius = Math.max(0, CARD_CORNER_RADIUS * perCard - width / 2);

  context.strokeStyle = COLOR;
  context.lineWidth = width;
  context.setLineDash([width * DASH, width * GAP]);
  context.beginPath();
  context.roundRect(width / 2, width / 2, canvas.width - width, canvas.height - width, radius);
  context.stroke();

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  cached.anisotropy = 8; // the renderer clamps this to the device maximum
  return cached;
};
