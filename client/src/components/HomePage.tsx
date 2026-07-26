import { Swords } from 'lucide-react';
import { ControllerButton } from '@/components/ControllerButton';
import { TokensPanel } from '@/components/TokensPanel';

// The `/` route. `app/page.tsx` only mounts this — all markup lives here.
export function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <Swords className="size-10 text-ps-accent" />
      <h1>Pistols Solitaire</h1>
      <p>Pistols At Dawn, Solitaire Edition.</p>
      <div className="mt-4">
        <ControllerButton />
      </div>
      <TokensPanel />
    </main>
  );
}
