/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Required for tesseract.js worker
    config.resolve.fallback = { ...config.resolve.fallback, fs: false }
    return config
  },
}

module.exports = nextConfig
