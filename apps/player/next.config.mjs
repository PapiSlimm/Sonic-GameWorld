/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
      "@sonic-gameworld/world-schema",
      "@sonic-gameworld/events",
      "@sonic-gameworld/spatial-engine",
      "@sonic-gameworld/ui",
      "@sonic-gameworld/ai-sdk",
      "@sonic-gameworld/auth-sdk",
      "@sonic-gameworld/marketplace-sdk",
      "@sonic-gameworld/analytics-sdk",
      "@sonic-gameworld/asset-sdk",
      "@sonic-gameworld/gameworld-sdk"
  ],
  experimental: { optimizePackageImports: ['lucide-react'] },
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { canvas: 'canvas' }];
    return config;
  },
};

export default nextConfig;
