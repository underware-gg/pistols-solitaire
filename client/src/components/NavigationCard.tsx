import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

//
// A menu tile: icon, label, optional hint. A card with a route is a link; a card without
// one is a placeholder for a page that does not exist yet — rendered as a plain div so it
// can't be clicked, focused or crawled.
//

const cardStyle =
  'flex flex-col items-center justify-center gap-2 rounded-xl border border-ps-text bg-ps-panel/40 p-6 text-center shadow-card transition-all';

export function NavigationCard({
  href,
  label,
  hint,
  icon: Icon,
  className,
}: {
  href?: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  className?: string;
}) {
  const content = (
    <>
      <Icon className="size-7 text-ps-accent" />
      <h3>{label}</h3>
      {hint && <span className="text-ps-text/60 text-xs">{hint}</span>}
    </>
  );

  if (!href) {
    return (
      <div aria-disabled className={cn(cardStyle, 'cursor-not-allowed opacity-40', className)}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        cardStyle,
        'hover:border-ps-accent hover:bg-ps-panel hover:shadow-card-hover',
        className,
      )}
    >
      {content}
    </Link>
  );
}
