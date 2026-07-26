import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

//
// The one button primitive. Call sites pick a `variant`/`size`; one-off tweaks still go
// through `className`, which is merged last (see specs/CODING_STYLE.md).
//
// The feedback is motion, not fading: hover swells the button slightly, press snaps it
// under the cursor and it springs back on release. Dimming a button on hover reads as
// *less* available, which is backwards, so no variant fades on hover — `opacity` is
// reserved for `disabled`. Both are gated behind `not-disabled:` so a disabled button is
// inert to the pointer, and `active:` runs at half the duration: a press should feel
// instant, a hover should feel soft.
//
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded border small-caps font-title transition duration-150 ease-out not-disabled:hover:scale-105 not-disabled:active:scale-95 not-disabled:active:duration-75 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-ps-text bg-ps-text text-ps-bg',
        secondary: 'border-ps-line bg-ps-panel text-ps-text not-disabled:hover:border-ps-accent',
        // No chrome at all — for icon-only controls. Its whole hover state is the accent.
        ghost: 'border-transparent bg-transparent text-ps-text not-disabled:hover:text-ps-accent',
        // Not a button at all: clickable text. It sits at 90% and comes up to full
        // strength on hover — the one place opacity is a hover state rather than a
        // disabled marker, because here there is no box to react. The scale is cancelled
        // on both hover and press: text that grows and shrinks under the cursor reads as
        // a widget, which is exactly what this variant exists to avoid.
        text: 'border-transparent bg-transparent text-ps-text/90 not-disabled:hover:scale-100 not-disabled:hover:text-ps-text not-disabled:active:scale-100',
      },
      size: {
        sm: 'px-2.5 py-1 text-xs',
        md: 'px-4 py-1.5 text-sm',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
