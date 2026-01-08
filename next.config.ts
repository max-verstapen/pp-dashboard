import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Transpile packages that use ESM
  transpilePackages: [
    "@web3auth/modal",
    "@metamask/delegation-toolkit",
    "@toruslabs/ethereum-controllers",
  ],
  // Enable experimental features for better ESM support
  experimental: {
    esmExternals: true,
  },
  // Turbopack configuration (Next.js 16 default)
  turbopack: {
    // Turbopack handles module resolution automatically
  },
  // Keep webpack config for non-Turbopack builds (when using --webpack flag)
  webpack: (config, { isServer }) => {
    // Ensure proper resolution of viem subpath exports
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    
    // Handle fallbacks for Node.js modules in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    return config;
  },
};

export default nextConfig;
