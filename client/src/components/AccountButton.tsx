'use client';

import { useState } from 'react';
import { refreshInjectedWallets } from '@/components/providers/StarknetProvider';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useController } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';
import { pascalCase } from '@/utils/misc';

// The account's spot in the header, and the app's *only* way in: Connect while disconnected — which
// opens the wallet picker — and the connected account once in. No page or menu offers a second one;
// disconnecting stays a `HeaderMenu` option.
export function AccountButton({ className }: { className?: string }) {
  const { isConnected, isConnecting, isController, username, address, wallet, openController } =
    useController();

  //
  // A page load reconnects the last used wallet before it can say who the player is, so the
  // account's own spot holds a spinner until it can hold a name. Nothing else moves: the mark is the
  // size of the type it stands in for, so the header does not reflow when the name lands.
  //
  if (isConnecting) {
    return <Spinner size="sm" label="Connecting" className={cn('text-ps-text/60', className)} />;
  }

  if (!isConnected) {
    return <WalletPicker className={className} />;
  }

  const label = username ? pascalCase(username) : `${address?.slice(0, 6)}…${address?.slice(-4)}`;

  // Only the Controller has a profile to open; any other wallet's account is a plain label, with
  // that wallet's icon so the player can tell which one they are in.
  if (!isController) {
    return (
      <span
        title={wallet?.name}
        className={cn('inline-flex items-center gap-2 small-caps font-title text-sm', className)}
      >
        {wallet && <WalletIcon icon={wallet.icon} />}
        {label}
      </span>
    );
  }

  return (
    <Button variant="text" onClick={() => openController()} className={className}>
      {label}
    </Button>
  );
}

//
// Connect, and the list of every Starknet wallet get-starknet discovered — the Controller first, then
// whatever extension is installed (Ready, Braavos). Opening it scans `window.starknet_*` again, for an
// extension that injected after the page's own scans.
//
// Same popover as `HeaderMenu`: local open state and a full-screen transparent button behind the
// panel that closes it on any outside click.
//
function WalletPicker({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { wallets, connect } = useController();

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="secondary"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) refreshInjectedWallets();
          setIsOpen(open => !open);
        }}
      >
        Connect
      </Button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close wallet list"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <ul className="absolute left-0 z-40 mt-1 min-w-48 rounded-xl border border-ps-line bg-ps-panel p-1 shadow-card">
            {wallets.map(wallet => (
              <li key={wallet.name}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-ps-bold/10 hover:text-ps-bold"
                  onClick={() => {
                    setIsOpen(false);
                    connect(wallet);
                  }}
                >
                  <WalletIcon icon={wallet.icon} />
                  <h5>{wallet.name}</h5>
                </button>
              </li>
            ))}
            {wallets.length === 0 && (
              <li className="px-3 py-2 text-ps-text/60 text-sm">No Starknet wallet found</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

// A wallet-standard icon is a data URI the wallet hands us — nothing for `next/image` to optimize.
function WalletIcon({ icon }: { icon: string }) {
  return <img src={icon} alt="" className="size-4 shrink-0" />;
}
