// app/(console)/layout.tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import { Header } from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { TenantProvider } from "@/context/tenant-context";
import { siteConfig } from "@/config/site";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import Providers from "@/app/providers";
import ToolRegistryPanel from "@/components/ToolRegistryPanel";
import Banner from "@/components/banner";
import { BotIdClient } from "botid/client";

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
  title: "Strategic Machines | Agent Console",
  description: "Console for configuring and testing Strategic Machines agents.",
  openGraph: {
    title: "Strategic Machines | Agent Console",
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
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <TenantProvider >    
        <Providers>
          {/* BotId can live here; App Router will merge it into <head> properly */}
          <BotIdClient protect={protectedRoutes} />

          <div
            className={cn(
              "relative flex min-h-dvh flex-col bg-background items-center",
              geistSans.variable
            )}
          >
            <Banner />
            <Header />

            <main className="flex flex-1 justify-center items-start w-full">
              {children}
            </main>
          </div>

          <Toaster />
          <ToolRegistryPanel />
          <Analytics />
        </Providers>
      </TenantProvider>
    </ThemeProvider>
  );
}
