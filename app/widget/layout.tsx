// app/(console)/layout.tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const protectedRoutes = [
  {
    path: "/api/session",
    method: "POST",
  },
];

// web-specific metadata (will override root for these routes)
export const metadata: Metadata = {
  title: "Strategic Machines | VOX",
  description: "Every Business Needs a Voice",
  openGraph: {
    title: "Strategic Machines | VOX",
    siteName: "Strategic Machines",
    url: "https://voice.strategicmachines.ai/",
    images: [
      {
        url: "https://res.cloudinary.com/stratmachine/image/upload/v1592332360/machine/icon-384x384_liietq.png",
      },
    ],
  },
};

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
      <>
        <div
          className={cn(
            "relative flex min-h-dvh flex-col bg-background items-center",
            geistSans.variable
          )}
        > 
          <main className="flex flex-1 justify-center items-start w-full">
            {children}
          </main>
        </div>
        <Toaster />       
        <Analytics />
      </>     
  );
}
