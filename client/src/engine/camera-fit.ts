import * as THREE from 'three';

//
// Framing a table: keep the camera's angle, back it off until the layout fits.
//
// This is why nothing on any table is measured in pixels. A layout says how much felt it needs, in
// cards, and the camera works out how far away it has to sit — so every number in a `TABLE`/`BOARD`
// block is free to move, and a change to the grid re-frames the shot on its own rather than needing
// a matching change to a camera distance somewhere else.
//
// Both tables use it identically: `/bag` frames a grid of decks or a dealt page, `/solitaire` frames
// a Klondike board. What differs is only the box each one asks for.
//

/** Half-extents of the box that has to stay on screen, around the table's centre, in card heights. */
export type HalfExtents = { width: number; height: number };

/**
 * How far back a camera of this field of view has to sit for `extents` to fit a viewport of this
 * aspect ratio — the wider of the two constraints, so nothing is cropped on either axis.
 *
 * `fov` is vertical and in **degrees**, as three.js takes it.
 */
export const fitDistance = (extents: HalfExtents, aspect: number, fov: number): number => {
  const halfFov = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return Math.max(extents.width / (halfFov * aspect), extents.height / halfFov);
};

/**
 * Where the camera is when it has finished framing a view, and which way it looks: along
 * `direction`, at `distance`, aimed at the table's centre.
 *
 * Poses in front of the camera (a zoomed card, a dimmer plane) are derived from *this* rather than
 * from the live camera, so they are already correct while the camera is still damping between two
 * views — otherwise a card zoomed during a camera move would chase a moving target.
 */
export const cameraAt = (distance: number, direction: [number, number, number]) => {
  const position = new THREE.Vector3(...direction).normalize().multiplyScalar(distance);
  return { position, view: position.clone().normalize().negate() };
};

/** How much of the frame is visible at a given depth in front of the camera, in card heights. */
export const visibleAt = (fov: number, depth: number, aspect: number) => {
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * depth;
  return { height, width: height * aspect };
};
