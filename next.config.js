/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config, { isServer }) => {
    // @vladmandic/face-api is browser-only. Stub it out of the server bundle.
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@vladmandic/face-api': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
