import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  // @xenova/transformers loads ONNX native bindings — must NOT be bundled.
  // Next.js server-side bundling breaks native .node addons; marking these
  // as external makes them loaded via require() at runtime instead.
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node'],
  // Enable gzip/brotli compression for all responses (reduces payload 60-80%)
  compress: true,
  // Remove X-Powered-By header (minor security + bandwidth saving)
  poweredByHeader: false,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3001',
        '*.github.dev',
        '*.ngrok-free.app',
        '*.ngrok-free.dev',
        '*.ngrok.app',
        '*.ngrok.io',
        'tiles.fz.com',
      ],
    }
  },
  // The mobile preview uses a temporary ngrok origin during local development.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '*.ngrok-free.app',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.ngrok.io',
  ],
  // Rewrite /uploads/* → /api/uploads/* so images stored with old paths still work
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },
  // Keep upload assets cacheable, but let Next.js manage its own _next/static
  // headers. Overriding them in development can leave phones and Turbopack
  // with stale chunks after a code change.
  async headers() {
    return [
      {
        source: '/api/uploads/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
