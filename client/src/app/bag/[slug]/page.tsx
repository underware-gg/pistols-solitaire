import { notFound } from 'next/navigation';
import { SOLITAIRE_SLUG } from '@/components/pages/bag/solitaire-deck';
import { TokenCardsPage } from '@/components/pages/bag/TokenCardsPage';
import { PROFILE } from '@/dojo/config';

//
// One deck, named by its slug. The deck itself is opened by `BagScene` (which reads the same slug
// off the URL); all this route does is refuse a slug no deck on this network answers to, rather than
// showing an empty table at a working URL.
//
// Every collection's slug is `contracts.json`'s, plus the one deck that is not a collection — the
// standard deck at `/bag/solitaire`, which is on the table on every network.
//

const SLUGS = new Set([
  ...PROFILE.tokens.filter(token => token.type === 'ERC721').map(token => token.slug),
  SOLITAIRE_SLUG,
]);

/** Every deck is a real page at build time — the list is a constant, so prerender it. */
export function generateStaticParams() {
  return [...SLUGS].map(slug => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.has(slug)) notFound();
  return <TokenCardsPage />;
}
