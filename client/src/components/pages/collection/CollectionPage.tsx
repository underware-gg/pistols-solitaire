import { TokensPanel } from '@/components/TokensPanel';

// The `/collection` route — what the connected account owns.
export function CollectionPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center gap-4 p-8 text-center">
      <h1>Your Collection</h1>
      <TokensPanel />
    </main>
  );
}
