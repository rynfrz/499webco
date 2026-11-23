/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a verification build run next to a dev server without sharing its cache.
  distDir: process.env.NEXT_DIST_DIR || '.next'
};
module.exports = nextConfig;
