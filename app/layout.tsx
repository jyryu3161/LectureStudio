import type { Metadata } from 'next';

import { AppRail } from '@/components/app-rail';

import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lecture Studio',
  description: 'Write an ebook. It becomes your lecture.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="font-sans">
        <div className="flex h-screen w-full overflow-hidden bg-canvas">
          <AppRail />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
