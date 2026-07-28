import { Layers, Spade, Swords } from 'lucide-react';
import Image from 'next/image';
import { NavigationCard } from '@/components/NavigationCard';

// The `/` route. `app/page.tsx` only mounts this — all markup lives here.
// /decks and /solitaire exist; the other two cards are disabled placeholders.
export function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Image src="/logo/logo.png" alt="" width={512} height={512} priority className="size-24" />
      <h1 className="text-6xl opacity-90">Pistols Solitaire</h1>

      <nav className="mt-6 grid w-full grid-cols-2 gap-4 mb-[20%]">
        <NavigationCard className="px-15 py-10" href="/decks" label="Your Decks" icon={Layers} />
        <NavigationCard className="px-15 py-10" href="/solitaire" label="Solitaire" icon={Spade} />
        <NavigationCard className="px-15 py-10" label="Pistols Decks" hint="soon" icon={Layers} />
        <NavigationCard className="px-15 py-10" label="Duellling" hint="soon" icon={Swords} />
      </nav>
    </main>
  );
}
