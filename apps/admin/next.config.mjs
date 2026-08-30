/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
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
    // This app's source uses explicit `.js` extensions on relative TS imports (NodeNext-style),
    // which `tsc` (moduleResolution: Bundler) resolves to `.ts`/`.tsx` fine, but webpack does not
    // by default. Teach webpack the same extension aliasing so `next build` matches `tsc --noEmit`.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
