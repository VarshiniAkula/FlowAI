import { Hero } from '@/components/landing/hero';
import Link from 'next/link';
import { Brain } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-pink-600 text-white">
              <Brain className="size-4" />
            </div>
            <span className="font-semibold">FlowMind</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="#features"
              className="text-muted-foreground hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <Hero />
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-xs text-muted-foreground">
          Built with Next.js 15, Tailwind v4, React Flow v12, Vercel AI SDK 4
        </div>
      </footer>
    </div>
  );
}
