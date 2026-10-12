/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server (server.js + the node_modules it needs) for the portable tournament kit
  output: 'standalone',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
