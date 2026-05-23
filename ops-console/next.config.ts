import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  /* Dev proxy opcional: define API_PROXY_TARGET=http://localhost:3000 */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: `${target.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
