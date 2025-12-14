// app/widget/layout.tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import WidgetSonnerToaster from "@/components/widget/WidgetSonnerToaster";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// web-specific metadata (only for /widget)
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

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* ✅ route-scoped: only affects /widget */}
      <div
        className={cn(
          geistSans.variable,
          // critical: no forced background, no forced full-height
          "m-0 p-0 bg-transparent overflow-hidden"
        )}
      >
        {children}
      </div>

      {/* Pill Friendly Toaster for Toast */}
      <WidgetSonnerToaster />
      <Analytics />
    </>
  );
}
