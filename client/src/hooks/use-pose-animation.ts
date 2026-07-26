'use client';

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import { applyPose, damp, type Pose, POSE_EULER_ORDER } from '@/lib/card-pose';

//
// Drives an object toward a target pose, one damped step per frame. Attach the returned ref to
// the `<group>`; change the `pose` prop and it travels there, from wherever it currently is.
//
// The animation runs entirely outside React: nothing here sets state, so a card moving across
// the table costs no renders — only the frame loop touches the matrix.
//

/** Approach rates, in reciprocal seconds — higher is snappier. */
const MOVE_LAMBDA = 7;
const TURN_LAMBDA = 6;
const SCALE_LAMBDA = 9;

/** How high a travelling card floats per unit of ground still to cover, and its ceiling. */
const LIFT_PER_UNIT = 0.32;
const LIFT_MAX = 0.55;

export const usePoseAnimation = (
  pose: Pose,
  {
    /** Where the object starts on mount. Defaults to its target, i.e. no entrance. */
    initial = pose,
    /** Seconds to wait before moving — a per-card stagger is what makes a deal look dealt. */
    delay = 0,
    /** Whether the object arcs off the table while travelling. Cards do; a deck sliding aside does not. */
    lift = false,
  } = {},
) => {
  const ref = useRef<THREE.Group>(null);
  const elapsed = useRef(0);

  // Placed imperatively rather than through `position`/`rotation` props: those would be
  // re-applied on any re-render and teleport the card back to its entrance mid-flight. Runs on
  // mount only — `initial` is the entrance, and a later change to it means nothing.
  useLayoutEffect(() => {
    const object = ref.current;
    if (!object) return;
    object.rotation.order = POSE_EULER_ORDER;
    applyPose(object, initial);
  }, []);

  useFrame((_, rawDelta) => {
    const object = ref.current;
    if (!object) return;

    elapsed.current += rawDelta;
    if (elapsed.current < delay) return;

    // A backgrounded tab hands back one enormous delta; clamping it keeps cards from teleporting.
    const delta = Math.min(rawDelta, 1 / 30);
    const [x, y, z] = pose.position;

    //
    // The card floats while it still has ground to cover and settles as it arrives — that arc
    // is the whole difference between a card being *dealt* and a card sliding across the felt.
    // Because the lift is derived from the distance left, it falls to zero on its own and the
    // damped target ends up exactly where the layout put it.
    //
    const travel = lift ? Math.hypot(x - object.position.x, z - object.position.z) : 0;
    const arc = Math.min(travel * LIFT_PER_UNIT, LIFT_MAX);

    object.position.x = damp(object.position.x, x, MOVE_LAMBDA, delta);
    object.position.y = damp(object.position.y, y + arc, MOVE_LAMBDA, delta);
    object.position.z = damp(object.position.z, z, MOVE_LAMBDA, delta);

    object.rotation.x = damp(object.rotation.x, pose.rotation[0], TURN_LAMBDA, delta);
    object.rotation.y = damp(object.rotation.y, pose.rotation[1], TURN_LAMBDA, delta);
    object.rotation.z = damp(object.rotation.z, pose.rotation[2], TURN_LAMBDA, delta);

    object.scale.setScalar(damp(object.scale.x, pose.scale, SCALE_LAMBDA, delta));
  });

  return ref;
};
