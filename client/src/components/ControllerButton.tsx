'use client';

import { LogOut, User, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useController } from '@/hooks/use-controller';

// Connect / disconnect entry point. Disconnected: one connect button. Connected: a button
// that opens the Controller, plus disconnect.
export function ControllerButton() {
  const { isConnected, isConnecting, username, address, connect, disconnect, openController } =
    useController();

  if (!isConnected) {
    return (
      <Button onClick={connect} disabled={isConnecting}>
        <Wallet className="size-4" />
        {isConnecting ? 'Connecting…' : 'Connect'}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => openController()}>
        <User className="size-4" />
        {username ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`}
      </Button>
      <Button variant="ghost" size="sm" onClick={disconnect} aria-label="Disconnect">
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
