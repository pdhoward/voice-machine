// app/layout.tsx
import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Strategic Machines | Agents",
  description:
    "Strategic Machines is an AI-first company, delivering AI Agents for business.",
  keywords:
    "Strategic Machines, AI, Voice Agents, Ai Business Apps AI Development, AI Automation, Language Models, OpenAI, Anthropic, Hugging Face",
  openGraph: {
    title: "Strategic Machines | AI Agents",
    siteName: "Strategic Machines",
    url: "https://www.strategicmachines.ai/",
    images: [
      {
        url: "https://res.cloudinary.com/stratmachine/image/upload/v1592332360/machine/icon-384x384_liietq.png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>     
      <body className={cn("min-h-dvh bg-background font-sans antialiased", geistSans.variable )} >
         {children}
      </body>
    </html>
  );
}
