import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

//
// "There is something here for you" — a mark the app draws **over** the thing that has news, never
// beside it. It is a label and never a control: whatever it sits on is already the hit target, so it
// takes no pointer events and has none of `ui/`'s hover / active / disabled states.
//
// **The art is drawn as authored** — it is finished game art with its own colour and glow, so the
// badge's job is to place it and pulse it, not to re-colour it. (An earlier version masked the
// silhouette over a flat fill, the way the felt's logo stamp does; that is the right move for a
// stencil and the wrong one here, because a flat fill is exactly the texture thrown away.)
//
// **The pulse is saturation, not opacity and not hue** (`--animate-notify`): `opacity` is the
// disabled signal everywhere else in `ui/` and leaves the mark missing half the time, while anything
// that moves the hue is repainting art that already chose its colour. Saturation swings how *vivid*
// the same picture is, which reads as a mark catching the light. `motion-reduce` leaves it resting at
// its authored saturation.
//
// **A plain `<img>`, deliberately.** `next/image` lazy-loads behind an IntersectionObserver, and the
// first place this is used is a drei `<Html>` portal over the WebGL canvas — a transformed
// `overflow:hidden` layer where that observer cannot be relied on to ever report the element visible,
// so the fetch never starts and nothing appears. Nothing is given up: the box is a fixed pixel size
// and the art is one PNG.
//

const badge = cva(
  // Two classes here are load-bearing, and both exist because this is dropped into a box far smaller
  // than itself: the anchor it is centred on is a *point*, not a container (see `Deck3D`).
  //
  //   - **`max-w-none` is what makes the mark visible at all.** Tailwind's preflight ships
  //     `img { max-width: 100% }`, and 100% is the *containing block* — a one-pixel anchor, so the
  //     art is clamped to a one-pixel sliver no matter what `size-*` says. Against drei's own
  //     auto-width wrapper it clamped to **zero**, i.e. a badge that loaded and painted nothing.
  //     This is why the mark has to be positioned by a wrapper and not by growing that wrapper.
  //   - `shrink-0`, because a flex item that agreed to shrink would collapse instead of overflowing.
  //
  'pointer-events-none block max-w-none shrink-0 animate-notify object-contain motion-reduce:animate-none',
  {
    variants: {
      // The `ui/` scale, but in *badge* sizes: this is art over a surface, not type in a line, so it
      // has no icon size to match. A mark's whole job is being noticed.
      size: {
        sm: 'size-16',
        md: 'size-24',
        lg: 'size-32',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export function NotificationBadge({
  src,
  size,
  label,
  className,
}: VariantProps<typeof badge> & {
  /** The art. Drawn as authored, so it carries its own colour; `object-contain` fits it to the box. */
  src: string;
  /**
   * Announced to screen readers. Leave it off — the default — wherever the thing under the badge
   * already says what is waiting, which is the usual case: a caption read out twice is worse than a
   * mark that is only visual. Empty `alt` also keeps a mark that fails to load from wrapping a
   * description across the surface as prose.
   */
  label?: string;
  className?: string;
}) {
  return <img src={src} alt={label ?? ''} className={cn(badge({ size }), className)} />;
}
