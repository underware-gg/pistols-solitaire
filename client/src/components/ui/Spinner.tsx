import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

//
// The one "working on it" mark. It is a spinning `lucide` icon rather than a bordered div, so it
// inherits `currentColor` and sits inline with type at the same size the icons around it do.
//
// Sizes are the `ui/` set, and they are the *icon* sizes the buttons use — a spinner standing in for
// a control has to be the size of what it replaces, not a size of its own.
//

const spinner = cva('animate-spin', {
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-8',
    },
  },
  defaultVariants: { size: 'md' },
});

export function Spinner({
  size,
  label = 'Loading',
  className,
}: VariantProps<typeof spinner> & {
  /** Announced to screen readers; the mark itself carries no text. */
  label?: string;
  className?: string;
}) {
  return <Loader2 aria-label={label} role="status" className={cn(spinner({ size }), className)} />;
}
