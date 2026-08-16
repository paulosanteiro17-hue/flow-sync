import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'FlowSync — Real-time collaborative project management',
    template: '%s · FlowSync',
  },
  description:
    'Plan projects, collaborate in real time, and keep your team perfectly in sync. Kanban boards that update instantly for everyone looking at them.',
  applicationName: 'FlowSync',
  keywords: [
    'project management',
    'kanban',
    'real-time collaboration',
    'team workflow',
    'task tracking',
  ],
  openGraph: {
    type: 'website',
    title: 'FlowSync — Move work forward, together',
    description: 'Plan projects, collaborate in real time, and keep your team perfectly in sync.',
    siteName: 'FlowSync',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1015' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
