import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://flowmind-nine-tau.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'FlowMind — Visual AI Assistant Platform',
    template: '%s — FlowMind',
  },
  description:
    'A visual, production-grade AI assistant platform with graph runtime, RAG, and one-click deployment.',
  applicationName: 'FlowMind',
  authors: [{ name: 'FlowMind' }],
  keywords: [
    'AI assistant builder',
    'visual flow editor',
    'no-code chatbot',
    'RAG',
    'LLM',
    'graph runtime',
  ],
  openGraph: {
    type: 'website',
    siteName: 'FlowMind',
    title: 'FlowMind — Visual AI Assistant Platform',
    description:
      'Build, test, and ship LLM-powered assistants from a visual canvas. Cloud publishing in one click.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlowMind — Visual AI Assistant Platform',
    description:
      'Build, test, and ship LLM-powered assistants from a visual canvas.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
