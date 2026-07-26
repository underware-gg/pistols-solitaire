'use client';

import { User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useController } from '@/hooks/use-controller';

// The connected account: opens the Controller. Renders nothing while disconnected —
// connecting and disconnecting are both `HeaderMenu` options.
export function ControllerButton({ className }: { className?: string }) {
  const { isConnected, username, address, openController } = useController();

  if (!isConnected) return null;

  return (
    <Button variant="secondary" onClick={() => openController()} className={className}>
      <User className="size-4" />
      {username ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`}
    </Button>
  );
}
