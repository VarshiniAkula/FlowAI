import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@flowmind/shared'],
  // Keep the Gemini SDK (and its native/node deps) out of the bundler; load it
  // from node_modules at runtime in the Node.js server routes.
  serverExternalPackages: ['@google/genai'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
