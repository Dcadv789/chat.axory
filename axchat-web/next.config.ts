import type { NextConfig } from 'next';

function apiOriginFromEnv(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  try {
    return new URL(apiBase).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiOrigin = apiOriginFromEnv();
    return [
      {
        source: '/api/v1/uploads/:path*',
        destination: `${apiOrigin}/api/v1/uploads/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/settings',
        destination: '/settings/channels',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
