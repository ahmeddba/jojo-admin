/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
        // optional:
        // port: "",
        // pathname: "/**",
      },
    ],
    // or, older style:
    // domains: ["images.pexels.com"],
  },
};

export default nextConfig;
