'use client';

import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

//
// Dragging a card across the felt: where the pointer is, on a horizontal plane above the table.
//
// Hand-rolled rather than drei's `DragControls`, which does free 3D dragging of one object with no
// notion of a drop target — a card game needs the pointer projected onto the *table*, the run of cards
// under the cursor carried together, and the drop resolved against the rules.
//
// **What this hook does not do is decide anything.** It reports a payload and a point; the caller says
// what may be picked up and what a drop means. That keeps it usable by any card page: `payload` is
// whatever identifies the thing being carried (for solitaire, the pile and the index within it).
//
// Two details that are load-bearing:
//
// - **The pointer is tracked on `window`, not on the mesh.** R3F's `onPointerMove` only fires while the
//   cursor is over the object, and a dragged card is left behind the instant the pointer moves faster
//   than the damping — so the move and up listeners go on the window and the ray is rebuilt by hand
//   from the canvas rect. That also means a drag survives the pointer leaving the canvas entirely,
//   which is what makes releasing over the page chrome behave instead of stranding a card mid-air.
// - **Nothing here snaps back.** A drop that the caller rejects simply clears the drag, and the cards'
//   poses revert to the ones derived from unchanged game state — which the damped animation walks them
//   home along, for free. A snap-back animation would be code that this design does not need.
//

export type CardDrag<T> = {
  payload: T;
  /** Where on the drag plane the carried card's origin sits right now, in world space. */
  point: [number, number, number];
  /** True once the pointer has actually moved — a click is a drag that never went anywhere. */
  moved: boolean;
};

/** How far the pointer must travel before a press counts as a drag rather than a click, in cards. */
const DRAG_THRESHOLD = 0.06;

export const useCardDrag = <T>({
  height,
  onDrop,
}: {
  /** The plane the pointer is projected onto, in card heights above the felt. */
  height: number;
  /**
   * The drag ended. `moved` false means it was really a click, so a caller can leave the click
   * handling to `onClick` and ignore it here.
   */
  onDrop: (drag: CardDrag<T>) => void;
}) => {
  const camera = useThree(state => state.camera);
  const canvas = useThree(state => state.gl.domElement);

  const [drag, setDrag] = useState<CardDrag<T> | null>(null);

  // The drop handler through a ref, so the window listeners below can be attached **once** for the
  // life of the component. Read from props directly it would be a new function on every render, and a
  // drag re-renders every frame — i.e. the listeners would be torn down and rebuilt 60 times a second.
  const drop = useRef(onDrop);
  drop.current = onDrop;

  //
  // Everything the move listener needs, in refs: the listener is attached once per drag and must not
  // be re-bound on every pointer move (which is what reading these from state would cause).
  //
  const active = useRef(false);
  // Where the pointer landed relative to the card's origin, so a card is carried from the point it
  // was actually grabbed rather than snapping its centre under the cursor.
  const grabOffset = useRef(new Vector3());
  const origin = useRef(new Vector3());
  const moved = useRef(false);

  const plane = useRef(new Plane(new Vector3(0, 1, 0)));
  const raycaster = useRef(new Raycaster());
  const scratch = useRef(new Vector3());

  // The drag as last reported, mirrored out of state. `onPointerUp` needs the final value, and a state
  // updater is the wrong place to read it from: React may invoke an updater more than once (it does in
  // StrictMode), which would deliver the same drop twice.
  const latest = useRef<CardDrag<T> | null>(null);
  const set = useCallback((next: CardDrag<T> | null) => {
    latest.current = next;
    setDrag(next);
  }, []);

  /** Where the pointer meets the drag plane, or null if it somehow points away from the table. */
  const pointOnPlane = useCallback(
    (clientX: number, clientY: number): Vector3 | null => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const ndc = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.current.setFromCamera(ndc, camera);
      // `constant` is negated distance along the normal: the plane y = height.
      plane.current.constant = -height;
      return raycaster.current.ray.intersectPlane(plane.current, scratch.current);
    },
    [camera, canvas, height],
  );

  /**
   * Start carrying something. Call from a card's `onPointerDown` with whatever identifies it, and the
   * card's current world position so the grab offset can be worked out.
   */
  const begin = useCallback(
    (what: T, event: ThreeEvent<PointerEvent>, cardOrigin: [number, number, number]) => {
      const hit = pointOnPlane(event.clientX, event.clientY);
      if (!hit) return;
      active.current = true;
      moved.current = false;
      origin.current.set(...cardOrigin);
      grabOffset.current.copy(origin.current).sub(hit);
      // Starts at the card's own place, lifted to the drag plane: picking a card up should raise it,
      // not jerk it sideways, and the pointer has not moved yet.
      set({ payload: what, point: [origin.current.x, height, origin.current.z], moved: false });
    },
    [height, pointOnPlane, set],
  );

  /** Abandon the drag without a drop — Escape, or the game state changing under it. */
  const cancel = useCallback(() => {
    active.current = false;
    set(null);
  }, [set]);

  //
  // The move/up listeners live for the whole life of the component rather than being attached per
  // drag: `active` is a ref, so the handlers are stable and there is no window-listener churn on
  // every press. They cost nothing while no drag is in progress.
  //
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!active.current) return;
      const hit = pointOnPlane(event.clientX, event.clientY);
      if (!hit) return;
      const at = hit.clone().add(grabOffset.current);
      if (!moved.current && at.distanceTo(origin.current) > DRAG_THRESHOLD) moved.current = true;
      const current = latest.current;
      if (!current) return;
      set({ payload: current.payload, point: [at.x, height, at.z], moved: moved.current });
    };

    const onPointerUp = () => {
      if (!active.current) return;
      active.current = false;
      const finished = latest.current;
      set(null);
      if (finished) drop.current(finished);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [height, pointOnPlane, set]);

  return { drag, begin, cancel };
};
