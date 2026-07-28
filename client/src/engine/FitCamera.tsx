'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { Vector3 } from 'three';
import { damp } from '@/engine/card-pose';

//
// Holds the camera at a fixed angle over the table and slides it along that line to `distance`.
//
// The distance is **damped rather than set**, which is what makes a change of view part of the
// animation: on `/decks` the decks are framed tightly and the table widens to take a dealt grid, so the
// pull-back *is* opening a deck. A layout that never changes its extents simply never moves it.
//
// Nothing here decides where to be — `distance` comes from `fitDistance` in the page's layout, so
// the camera and the poses are always working from the same number.
//

/** Approach rate for the camera, in reciprocal seconds. Slower than a card: a camera has weight. */
const CAMERA_LAMBDA = 5;

export function FitCamera({
  distance,
  direction,
  fov,
}: {
  /** How far along `direction` to sit — `fitDistance(extents, aspect, fov)`. */
  distance: number;
  /** Where the table is seen from, as a direction from its centre. Normalized here. */
  direction: [number, number, number];
  /** Vertical field of view, in degrees. */
  fov: number;
}) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera;
  const unit = useMemo(() => new Vector3(...direction).normalize(), direction);
  const current = useRef(0);

  const place = (at: number) => {
    current.current = at;
    camera.position.copy(unit).multiplyScalar(at);
    camera.lookAt(0, 0, 0);
  };

  // The first frame is already framed — only later changes are worth animating.
  useLayoutEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    place(distance);
  }, [camera, fov]);

  useFrame((_, delta) => {
    if (Math.abs(current.current - distance) < 0.001) return;
    place(damp(current.current, distance, CAMERA_LAMBDA, Math.min(delta, 1 / 30)));
  });

  return null;
}
