import { Swords } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <Swords className="size-10 text-ps-accent" />
      <h1>Pistols Solitaire</h1>
      <p>
        Scaffold is up. Edit <code>src/app/page.tsx</code> to get started.
      </p>
    </main>
  );
}
