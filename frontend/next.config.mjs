/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Wallet adapters pull in node builtins that have no browser equivalent.
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
