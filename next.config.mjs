import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server (server.js + the node_modules it needs) for the portable tournament kit
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_PANEL_VERSION: version,
  },
  // No Next.js "N" dev tools button in the corner during npm run dev
  devIndicators: false,
};

export default nextConfig;
