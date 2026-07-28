import { notFound } from 'next/navigation';
import { TokenCardsPage } from '@/components/pages/bag/TokenCardsPage';
import { PROFILE } from '@/dojo/config';

//
// One collection, named by its `contracts.json` slug. The deck itself is opened by `BagScene`
// (which reads the same slug off the URL); all this route does is refuse a slug no collection on
// this network answers to, rather than showing an empty table at a working URL.
//

const SLUGS = new Set(
  PROFILE.tokens.filter(token => token.type === 'ERC721').map(token => token.slug),
);

/** Every collection is a real page at build time — the list is a constant, so prerender it. */
export function generateStaticParams() {
  return [...SLUGS].map(slug => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.has(slug)) notFound();
  return <TokenCardsPage />;
}
