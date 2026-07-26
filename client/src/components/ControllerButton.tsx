'use client';

import { Button } from '@/components/ui/Button';
import { useController } from '@/hooks/use-controller';
import { pascalCase } from '@/utils/misc';

// The connected account: opens the Controller. Renders nothing while disconnected —
// connecting and disconnecting are both `HeaderMenu` options.
export function ControllerButton({ className }: { className?: string }) {
  const { isConnected, username, address, openController } = useController();

  if (!isConnected) return null;

  return (
    <Button variant="text" onClick={() => openController()} className={className}>
      {username ? pascalCase(username) : `${address?.slice(0, 6)}…${address?.slice(-4)}`}
    </Button>
  );
}
