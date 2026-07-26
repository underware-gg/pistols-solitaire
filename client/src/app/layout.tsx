import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers/providers';
import '@/styles/main.css';

export const metadata: Metadata = {
  title: 'Pistols Solitaire',
  description: 'Pistols at Dawn, solitaire edition',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
