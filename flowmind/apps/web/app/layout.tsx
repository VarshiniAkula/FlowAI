import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlowMind — Visual AI Assistant Platform',
  description:
    'A visual, production-grade AI assistant platform with graph runtime, RAG, and one-click deployment.',
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
