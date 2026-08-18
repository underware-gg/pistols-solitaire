'use client';

import { House, type LucideIcon, LogOut, Menu, Brush, ScrollText } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useController } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';
import { useSettingsStore } from '@/stores/settings-store';

//
// The header's hamburger — the home for actions that don't deserve a button of their own:
// navigation, the settings, and disconnecting. Connecting is not one of them: the single way in is
// the `ControllerButton` next to it, which is also where the connected account lives.
//
// "Switch table" cycles the felt colour and deliberately leaves the menu open — it is the
// one item whose effect is visible behind the panel, so cycling to the table you want takes
// one click per step instead of three.
//
// Open state is local, and a full-screen transparent button behind the panel closes it on
// any outside click — a plain element, no document listener and no focus trap to maintain.
//

export function HeaderMenu({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { isConnected, disconnect } = useController();
  const cycleTableColor = useSettingsStore(s => s.cycleTableColor);
  const router = useRouter();
  // A route already open is dropped from the menu rather than shown as a no-op.
  const pathname = usePathname();

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
            {pathname !== '/' && (
              <MenuButton
                icon={House}
                label="Home"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/');
                }}
              />
            )}
            <MenuButton icon={Brush} label="Switch table" onClick={cycleTableColor} />
            {pathname !== '/contracts' && (
              <MenuButton
                icon={ScrollText}
                label="Contracts"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/contracts');
                }}
              />
            )}
            {isConnected && (
              <MenuButton
                icon={LogOut}
                label="Disconnect"
                onClick={() => {
                  setIsOpen(false);
                  disconnect();
                }}
              />
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-ps-bold/10 hover:text-ps-bold',
          className,
        )}
        onClick={onClick}
      >
        <Icon className="size-4" />
        <h5>{label}</h5>
      </button>
    </li>
  );
}
