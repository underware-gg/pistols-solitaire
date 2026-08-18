import { ControllerButton } from '@/components/ControllerButton';
import { HeaderMenu } from '@/components/HeaderMenu';
import { cn } from '@/lib/cn';

// The app bar, mounted once in `app/layout.tsx` so it is on every page: the hamburger menu and,
// next to it, the account spot — Connect, or the Controller button once connected. Navigation
// lives inside the menu.
export function Header({ className }: { className?: string }) {
  return (
    <header className={cn('flex items-center gap-2 px-6 py-4', className)}>
      <HeaderMenu />
      <ControllerButton />
    </header>
  );
}
