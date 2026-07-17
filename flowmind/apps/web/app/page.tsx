import { Hero } from '@/components/landing/hero';
import Link from 'next/link';
import { Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Brain className="size-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              FlowMind
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link
              href="#features"
              className="hidden text-muted-foreground hover:text-foreground sm:block"
            >
              Features
            </Link>
            <Button asChild variant="gradient" size="sm">
              <Link href="/dashboard">Build Assistant</Link>
            </Button>
          </nav>
        </div>
      </header>
      <Hero />
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground">
              <Brain className="size-3.5" />
            </div>
            <span className="font-display font-semibold text-foreground">
              FlowMind
            </span>
          </div>
          <span>
            Built with Next.js 15, Tailwind v4, React Flow v12, Supabase +
            pgvector
          </span>
        </div>
      </footer>
    </div>
  );
}
