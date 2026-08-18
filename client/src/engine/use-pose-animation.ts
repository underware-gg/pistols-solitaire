'use client';

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { CARD_ASPECT, cardHeight, cardWidth } from '@/engine/card-geometry';
import { applyPose, damp, dampQuaternion, type Pose, POSE_EULER_ORDER } from '@/engine/card-pose';

//
// Drives an object toward a target pose, one damped step per frame. Attach the returned ref to
// the `<group>`; change the `pose` prop and it travels there, from wherever it currently is.
//
// The animation runs entirely outside React: nothing here sets state, so a card moving across
// the table costs no renders — only the frame loop touches the matrix.
//

/**
 * Approach rates, in reciprocal seconds — higher is snappier.
 *
 * `MOVE_LAMBDA` is exported because the zoom dimmer travels *with* the card it sits behind, and can
 * only stay behind it by damping at exactly this rate — see `zoomBackdropDepth`.
 */
export const MOVE_LAMBDA = 7;
/**
 * The rate a *held* card moves at. Direct manipulation is the one case where the damping is felt as
 * lag rather than as weight — at `MOVE_LAMBDA` a dragged card trails a visible distance behind the
 * cursor — so a card under the pointer is pulled along an order of magnitude harder. Still damped
 * rather than snapped, which is what keeps the rest of the run following the one being carried.
 */
export const GRAB_LAMBDA = 30;
const TURN_LAMBDA = 6;
const SCALE_LAMBDA = 9;

/** How high a travelling card floats per unit of ground still to cover, and its ceiling. */
const LIFT_PER_UNIT = 0.32;
const LIFT_MAX = 0.55;

/**
 * How much of its own overhang a card lifts by while it is turning over — see the hop in the frame
 * loop. **Above 1 or the pile it is lying on cuts through it**; the excess is the margin.
 *
 * A card rotates about its own centre, so mid-turn it is standing on an edge and hangs a long way
 * below that centre — half its height turning end over end, half its *width* turning sideways. Lying
 * on a pile, that is inside the cards underneath and the turn is drawn cut in two.
 */
const FLIP_CLEARANCE = 1.2;

//
// Scratch for the frame loop, so a card in flight allocates nothing. Safe to share: every use begins
// and ends inside one synchronous call.
//
const _euler = new THREE.Euler();
const _target = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * How far a card's lowest corner hangs below its own centre in this orientation, in card heights.
 *
 * **Read off the card's own axes, not its `x` angle**, because the axis a card turns about is no longer
 * fixed (see the slerp in the frame loop): a sideways turn passes through `rotation.x === 0`, which by
 * that measure reads as *flat* while the card is in fact standing straight up on its long edge. Each
 * axis contributes how vertical it has become, so this is 0 lying flat either way up whatever the
 * yaw, half a height standing on the short edge, and half a width standing on the long one.
 */
const overhang = (q: THREE.Quaternion, aspect: number): number =>
  Math.abs(_axis.set(0, 1, 0).applyQuaternion(q).y) * (cardHeight(aspect) / 2) +
  Math.abs(_axis.set(1, 0, 0).applyQuaternion(q).y) * (cardWidth(aspect) / 2);

/** The same, for a pose's Euler triple — the orientation an object mounts at. */
const overhangOf = (rotation: Pose['rotation'], aspect: number): number =>
  overhang(
    _target.setFromEuler(_euler.set(rotation[0], rotation[1], rotation[2], POSE_EULER_ORDER)),
    aspect,
  );

export const usePoseAnimation = (
  pose: Pose,
  {
    /** Where the object starts on mount. Defaults to its target, i.e. no entrance. */
    initial = pose,
    /**
     * Seconds to wait before moving — a per-card stagger is what makes a deal look dealt.
     *
     * **Mount-only, like `initial`**, and for the same reason: it belongs to the entrance. It is
     * measured against the object's whole life, so it can only ever gate the first moment of it, and
     * reading it live meant any re-render inside the stagger window (a hover two cards away is
     * enough) cancelled the wait and sent the card early.
     */
    delay = 0,
    /** Whether the object arcs off the table while travelling. Cards do; a deck sliding aside does not. */
    lift = false,
    /** How hard the object is pulled toward its target. `GRAB_LAMBDA` while a card is dragged. */
    moveLambda = MOVE_LAMBDA,
    /** The card's shape, for the turn hop — how far it hangs below its centre depends on it. */
    aspect = CARD_ASPECT,
  } = {},
) => {
  const ref = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const waitFor = useRef(delay);
  /** The turn hop currently added to `position.y`, so it can be taken back off before damping. */
  const hop = useRef(0);
  /** How far the card is *meant* to hang below its centre, damped — see the hop in the frame loop. */
  const rest = useRef(overhangOf(initial.rotation, aspect));

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
    if (elapsed.current < waitFor.current) return;

    // A backgrounded tab hands back one enormous delta; clamping it keeps cards from teleporting.
    const delta = Math.min(rawDelta, 1 / 30);
    const [x, y, z] = pose.position;

    //
    // Turned first, because the hop below is derived from where the card has actually turned to — and
    // **slerped, not damped angle by angle, which is what makes the *axis* of a turn a consequence of
    // the two poses** instead of always being the board's x. Interpolating Euler angles separately
    // sweeps `x` through upright whatever the other two are doing, so a card could only ever turn over
    // end over end; the shortest arc between a face-down pose *yawed a half turn* and its face-up one
    // is 180° about z instead, i.e. the card turning over sideways (`Rx(180)·Ry(180) = Rz(180)` —
    // verified: the arc holds the card's top edge still throughout and lands exactly on the target).
    // For every pair of poses that differ in the tilt alone the two are identical.
    //
    _target.setFromEuler(
      _euler.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], POSE_EULER_ORDER),
    );
    const meant = overhang(_target, aspect);
    dampQuaternion(object.quaternion, _target, TURN_LAMBDA, delta);

    //
    // The turn hop: **how much further the card hangs below its own centre than it is meant to**, which
    // is exactly the clearance a turn needs.
    //
    // - mid-turn the card is meant to be flat and this is at its widest — it rises as it stands up and
    //   settles as it lies back down, entirely as a function of the turn, so the two cannot drift;
    // - a card resting at a tilt (a hovered card, a carried one) subtracts its *own* tilt back out and
    //   gets nothing. The hover lift is the tuned number there and this must not add to it;
    // - a card whose pose stands it up on purpose — a zoomed card facing the camera — never hangs lower
    //   than intended, so the term clamps away and the framing is left alone.
    //
    // **`rest` is damped at the rate the card turns, and reading the pose directly instead is a real
    // bug**: an un-hovered card's target goes flat the instant the pointer leaves, while the card
    // itself is still 6° over — so it would find itself hanging lower than intended and kick *up* by
    // the difference (measured: 0.100 → 0.146) before settling. Damped, both sides decay together and
    // the term stays at zero, because near flat the overhang is linear in the angle.
    //
    // Added to the damped height rather than damped *toward*: a turn is over in a tenth of a second,
    // and a hop inside the damping reaches well under half its target and peaks after the card is flat
    // again — simulated, it never clears the pile at any amplitude. The previous frame's hop comes back
    // off first, so the damping itself never sees it.
    //
    rest.current = damp(rest.current, meant, TURN_LAMBDA, delta);
    const flip = Math.max(0, overhang(object.quaternion, aspect) - rest.current) * FLIP_CLEARANCE;

    //
    // The card floats while it still has ground to cover and settles as it arrives — that arc
    // is the whole difference between a card being *dealt* and a card sliding across the felt.
    // Because the lift is derived from the distance left, it falls to zero on its own and the
    // damped target ends up exactly where the layout put it.
    //
    const travel = lift ? Math.hypot(x - object.position.x, z - object.position.z) : 0;
    const arc = Math.min(travel * LIFT_PER_UNIT, LIFT_MAX);

    object.position.x = damp(object.position.x, x, moveLambda, delta);
    object.position.y = damp(object.position.y - hop.current, y + arc, moveLambda, delta) + flip;
    object.position.z = damp(object.position.z, z, moveLambda, delta);
    hop.current = flip;

    object.scale.setScalar(damp(object.scale.x, pose.scale, SCALE_LAMBDA, delta));
  });

  return ref;
};
