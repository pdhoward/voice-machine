import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
   eslint: {
    // ✅ Don't fail production builds on ESLint errors
      ignoreDuringBuilds: true,
    },
   logging: {
      incomingRequests: process.env.NODE_ENV === "production" ? false : true,
   },
   compiler: {
      removeConsole: process.env.NODE_ENV === "production"
    },
  reactStrictMode: true,
     images: {     
      remotePatterns: [
        {
          protocol: "https",
          hostname: "res.cloudinary.com",          
          pathname: "/stratmachine/**",
        },
        {
          protocol: "https",
          hostname: "cdn.cypressresorts.com",
          pathname: "/**",
        },
        {
          protocol: "https",
          hostname: "cypressbooking.vercel.app",
          pathname: "/**",
        },
        {
          protocol: "https",
          hostname: "product-booking.vercel.app",
          pathname: "/**",
        },
      ],    
  },
   allowedDevOrigins: [
    "localhost:3000",       
    "chaotic.ngrok.io",    
    "local-origin.dev",
    "*.local-origin.dev",
  ],
};

export default withBotId(nextConfig);
