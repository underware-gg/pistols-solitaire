'use client';

import { Button, type ButtonProps } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { MintControl, MintPhase } from '@/hooks/use-mint-flow';
import { cn } from '@/lib/cn';

//
// The control for a `useMintFlow`: one button that says where the write has got to.
//
// The table has three of these — the free starter pack, buying a pack, and opening one — and they
// differ only in their wording and their loudness, so what they share is a component rather than a
// copied set of spinners. **Every phase but `ready` is disabled and spinning**, which is the whole
// behaviour: a transaction is in flight or its mint is being indexed, and either way the answer to a
// second click is no. `labels` is what makes that legible; `indexing` in particular has to say the
// wait is for something to arrive, or a button that just stopped spinning looks finished with nothing
// to show.
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
  disabled = false,
  className,
}: {
  flow: MintControl;
  /**
   * What the button reads in each phase. See the note above on `indexing`.
   *
   * **A phase may have no label, and then it is the spinner alone** — for a control with no room for
   * a word (`PackOpen`, one button per card in a grid). `ready` is always required: it is what the
   * button offers to do, and it stays the accessible name through every other phase.
   */
  labels: { ready: string } & Partial<Record<MintPhase, string>>;
  variant?: ButtonProps['variant'];
  size?: NonNullable<ButtonProps['size']>;
  /**
   * Locked for a reason of the caller's, on top of the phase. For a button that is one of several on
   * one flow (`PackOpen`): the pack somebody else's button is opening leaves every other pack
   * un-openable, and only the caller knows that.
   */
  disabled?: boolean;
  className?: string;
}) {
  const waiting = flow.phase !== 'ready';
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('pointer-events-auto', className)}
      disabled={waiting || disabled}
      // Held at `ready`'s wording so the control keeps one name, whether or not the phase it is in
      // has one to show.
      aria-label={labels.ready}
      onClick={flow.send}
    >
      {waiting && <Spinner size={SPINNER_SIZE[size]} />}
      {labels[flow.phase]}
    </Button>
  );
}
