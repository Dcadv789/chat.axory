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
    // Abas que foram consolidadas em outras telas. Feito no config (camada de
    // roteamento) em vez de páginas com redirect() — evita renderizar um Server
    // Component que só redireciona (que quebrava a medição de performance do dev).
    return [
      { source: '/settings', destination: '/settings/general', permanent: false },
      { source: '/settings/members', destination: '/settings/general', permanent: false },
      { source: '/settings/sectors', destination: '/settings/general', permanent: false },
      { source: '/settings/tags', destination: '/settings/general', permanent: false },
      { source: '/settings/notifications', destination: '/settings/general', permanent: false },
      { source: '/settings/quick-replies', destination: '/settings/general', permanent: false },
      { source: '/settings/whatsapp-templates', destination: '/settings/channels', permanent: false },
      { source: '/settings/api-keys', destination: '/settings/secrets', permanent: false },
      { source: '/contacts', destination: '/settings/contacts', permanent: false },
    ];
  },
};

export default nextConfig;
