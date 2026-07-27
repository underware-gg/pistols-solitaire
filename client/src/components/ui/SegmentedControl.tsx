import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

//
// A row of mutually exclusive options, joined into one control: exactly one is picked, and
// picking is the whole interaction.
//
// It is built out of `Button` rather than out of its own cva, so a segment *is* a button —
// same height, same padding, same motion, and a new button size or variant reaches it for
// free. The selection is the variant: `primary` is the chosen segment (the same weight the
// header's Connect button has), `secondary` the ones on offer. Only the outer corners are
// rounded and the shared border is collapsed with `-ml-px`, which is what turns two buttons
// into one control.
//
// The one thing a segment does *not* inherit is the swell: a button grows because it is a
// thing you press, and a segment is one cell of a fixed frame — scaling it pushes against
// its neighbour and makes the control breathe. Hover here is the border colour, which is
// what `secondary` already does.
//

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** For an icon-only segment, whose label carries no text. */
  ariaLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Names the group to screen readers — the segments only announce themselves. */
  label?: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size,
  disabled,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    // A `fieldset` rather than a `div role="group"` — same semantics, one less ARIA attribute
    // (Tailwind's preflight already strips its default border and padding).
    <fieldset aria-label={label} className={cn('inline-flex items-stretch', className)}>
      {options.map((option, index) => (
        <Button
          key={option.value}
          variant={option.value === value ? 'primary' : 'secondary'}
          size={size}
          disabled={disabled}
          aria-label={option.ariaLabel}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'not-disabled:hover:scale-100 not-disabled:active:scale-100',
            index > 0 && '-ml-px rounded-l-none',
            index < options.length - 1 && 'rounded-r-none',
          )}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}
