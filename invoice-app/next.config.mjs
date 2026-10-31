/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  webpack: (config) => {
    // pdf.js references an optional Node-only canvas package.
    config.resolve.alias.canvas = false;
    return config;
  },
};
export default nextConfig;
