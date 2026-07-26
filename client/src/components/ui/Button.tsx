import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

// The one button primitive. Call sites pick a `variant`/`size`; one-off tweaks still go
// through `className`, which is merged last (see specs/CODING_STYLE.md).
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded border font-mono transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-ps-accent bg-ps-accent text-ps-bg hover:bg-ps-accent/85',
        secondary:
          'border-ps-line bg-ps-panel text-ps-text hover:border-ps-accent hover:text-ps-bold',
        ghost: 'border-transparent bg-transparent text-ps-text hover:text-ps-bold',
      },
      size: {
        sm: 'px-2.5 py-1 text-xs',
        md: 'px-4 py-2 text-sm',
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
