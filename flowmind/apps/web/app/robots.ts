import type { MetadataRoute } from 'next';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://flowmind-nine-tau.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/dashboard'],
        // The editor and per-assistant chat pages are intentionally hidden
        // from crawlers — they're either user-data-bound or don't add SEO
        // value at scale.
        disallow: ['/editor/', '/chat/', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
