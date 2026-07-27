'use client';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useController } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';
import { pascalCase } from '@/utils/misc';

// The connected account: opens the Controller. Renders nothing while disconnected —
// connecting and disconnecting are both `HeaderMenu` options.
export function ControllerButton({ className }: { className?: string }) {
  const { isConnected, isConnecting, username, address, openController } = useController();

  //
  // A page load reconnects the last used Controller before it can say who the player is, so the
  // account's own spot holds a spinner until it can hold a name. Nothing else moves: the mark is the
  // size of the type it stands in for, so the header does not reflow when the name lands.
  //
  if (isConnecting) {
    return <Spinner size="sm" label="Connecting" className={cn('text-ps-text/60', className)} />;
  }

  if (!isConnected) return null;

  return (
    <Button variant="text" onClick={() => openController()} className={className}>
      {username ? pascalCase(username) : `${address?.slice(0, 6)}…${address?.slice(-4)}`}
    </Button>
  );
}
