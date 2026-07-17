import Link from 'next/link';
import { Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background to-indigo-950/5 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
          <Compass className="size-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t find that page. It may have moved, or the link might be wrong.
        </p>
        <div className="mt-6">
          <Button variant="gradient" asChild>
            <Link href="/dashboard">
              <Home className="size-4" /> Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
