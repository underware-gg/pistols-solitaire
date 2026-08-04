'use client';

import { Button, type ButtonProps } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { MintFlow, MintPhase } from '@/hooks/use-mint-flow';
import { cn } from '@/lib/cn';

//
// The control for a `useMintFlow`: one button that says where the write has got to.
//
// The table has two of these — the free starter pack and buying a pack — and they differ only in
// their wording and their loudness, so what they share is a component rather than a copied pair of
// spinners. **Every phase but `ready` is disabled and spinning**, which is the whole behaviour: a
// transaction is in flight or its mint is being indexed, and either way the answer to a second click
// is no. `labels` is what makes that legible; `indexing` in particular has to say the wait is the
// indexer's, or a button that just stopped spinning looks finished with nothing to show.
//
// It is chrome over the felt, so it carries `pointer-events-auto` itself — the wrappers over the
// canvas (`DecksScene`, and `Deck3D`'s own `action` layer) are inert by default.
//

/**
 * The icon size each button size carries, since the spinner stands in for one and has to be the size
 * of what it replaces. `ui/Spinner`'s sizes are the icon sizes, so this is a straight lookup rather
 * than a class.
 */
const SPINNER_SIZE = { sm: 'sm', md: 'sm', lg: 'md' } as const;

export function MintButton({
  flow,
  labels,
  variant,
  size = 'md',
  className,
}: {
  flow: MintFlow;
  /** What the button reads in each phase. See the note above on `indexing`. */
  labels: Record<MintPhase, string>;
  variant?: ButtonProps['variant'];
  size?: NonNullable<ButtonProps['size']>;
  className?: string;
}) {
  const waiting = flow.phase !== 'ready';
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('pointer-events-auto', className)}
      disabled={waiting}
      onClick={flow.send}
    >
      {waiting && <Spinner size={SPINNER_SIZE[size]} />}
      {labels[flow.phase]}
    </Button>
  );
}
