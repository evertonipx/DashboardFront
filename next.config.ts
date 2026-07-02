import type { NextConfig } from "next";

const apiUrl = process.env.IPXDATA_API_URL ?? "http://192.168.14.6:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${apiUrl}/api/:path*`,
        },
        {
          source: "/swagger/:path*",
          destination: `${apiUrl}/swagger/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
