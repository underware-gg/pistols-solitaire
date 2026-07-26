import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Providers } from '@/components/providers/providers';
import '@/styles/main.css';

export const metadata: Metadata = {
  title: 'Pistols Solitaire',
  description: 'Pistols at Dawn, solitaire edition',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions (Grammarly, wallets) write attributes onto <body> before React
        * hydrates, which React reports as a mismatch. This suppresses the warning for this
        * element's own attributes only — not its subtree — and we set nothing on <body>
        * ourselves, so no real mismatch can hide behind it. */}
      <body suppressHydrationWarning>
        <Providers>
          {/* Header on every page; each page's <main> takes the rest with `flex-1`. */}
          <div className="flex min-h-screen flex-col">
            <Header />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
