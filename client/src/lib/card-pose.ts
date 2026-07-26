import type * as THREE from 'three';

//
// Where a card is, and how a card gets there.
//
// Every animation on the table is expressed as a *target pose*: layout code derives the pose a
// card should be in from the current view (`table-layout.ts`), and each card damps toward it
// every frame (`hooks/use-pose-animation.ts`). There is no tween, no timeline and no animation
// library, on purpose — a deck can be opened, paged and closed faster than any deal finishes,
// and a damped target absorbs that for free: the new target simply replaces the old one and
// the card keeps moving from wherever it actually is. A tween would need to be stopped,
// re-based and restarted at every interruption, which is most of what pistols' imperative
// `three/CardMesh.tsx` does by hand.
//

/** One card's placement. Poses are plain data, derived in render, never mutated. */
export type Pose = {
  position: [number, number, number];
  /**
   * Euler angles in `POSE_EULER_ORDER`. `x` tilts the card off the felt — `FACE_DOWN` and
   * `FACE_UP` are the two flat poses and `0` stands it upright facing the camera — `y` spins it
   * flat on the table, `z` rolls it in its own plane.
   */
  rotation: [number, number, number];
  scale: number;
};

/**
 * `YXZ` makes `x` the tilt off the table and `y` the spin around the table's normal,
 * independently of each other. In the default `XYZ` order the spin would ride on top of the
 * tilt, and a flip would corkscrew.
 */
export const POSE_EULER_ORDER = 'YXZ';

/** Lying on the felt, back up: the card's face points down. */
export const FACE_DOWN = Math.PI / 2;
/** Lying on the felt, art up. A flip between the two sweeps through upright, facing the player. */
export const FACE_UP = -Math.PI / 2;

/** Frame-rate independent exponential smoothing toward `target`. */
export const damp = (current: number, target: number, lambda: number, delta: number): number =>
  current + (target - current) * (1 - Math.exp(-lambda * delta));

/** Snap an object onto a pose with no animation — used to place a card the frame it mounts. */
export const applyPose = (object: THREE.Object3D, pose: Pose) => {
  object.position.set(...pose.position);
  object.rotation.set(...pose.rotation);
  object.scale.setScalar(pose.scale);
};
