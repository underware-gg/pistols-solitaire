'use client';

import { House, LogIn, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useController } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';

//
// The header's hamburger — the home for actions that don't deserve a button of their own.
// Today that is just connect / disconnect; the connected account itself stays on the
// `ControllerButton` next to it.
//
// Open state is local, and a full-screen transparent button behind the panel closes it on
// any outside click — a plain element, no document listener and no focus trap to maintain.
//

const itemStyle =
  'flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-ps-bold/10 hover:text-ps-bold';

export function HeaderMenu({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { isConnected, isConnecting, connect, disconnect } = useController();
  const isHome = usePathname() === '/';

  const action = isConnected
    ? { label: 'Disconnect', icon: LogOut, run: disconnect }
    : { label: isConnecting ? 'Connecting…' : 'Connect', icon: LogIn, run: connect };

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
      >
        <Menu className="size-5" />
      </Button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <ul className="absolute left-0 z-40 mt-1 min-w-40 rounded-xl border border-ps-line bg-ps-panel p-1 shadow-card">
            {!isHome && (
              <li>
                <Link href="/" className={itemStyle} onClick={() => setIsOpen(false)}>
                  <House className="size-4 text-ps-accent" />
                  Home
                </Link>
              </li>
            )}
            <li>
              <button
                type="button"
                className={itemStyle}
                onClick={() => {
                  setIsOpen(false);
                  action.run();
                }}
              >
                <action.icon className="size-4 text-ps-accent" />
                {action.label}
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
