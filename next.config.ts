import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a larger repo; pin the root to here.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
