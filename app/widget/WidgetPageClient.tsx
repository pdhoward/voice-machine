// app/widget/WidgetPageClient.tsx
"use client";

import { useRef, useEffect,useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";
import Providers from "@/app/providers";
import { TenantProvider } from "@/context/tenant-context";
import { WidgetAgentPanel } from "@/components/widget/WidgetAgentPanel";
import "./widget.css";


function useWidgetAutoResize() {
  const ref = useRef<HTMLDivElement | null>(null);

  // ✅ useLayoutEffect gives a more stable first measurement
  useLayoutEffect(() => {
    if (!ref.current) return;

    function sendSize() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      window.parent.postMessage(
        {
          type: "sm-voice-widget-resize",
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        },
        "*"
      );
    }

    // First report
    sendSize();

    // ✅ Catch post-hydration / font / motion settling
    requestAnimationFrame(sendSize);
    setTimeout(sendSize, 50);
    setTimeout(sendSize, 250);

    const ro = new ResizeObserver(sendSize);
    ro.observe(ref.current);

    window.addEventListener("resize", sendSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sendSize);
    };
  }, []);

  return ref;
}

export default function WidgetPageClient() {
  const params = useSearchParams();
  const token = params.get("token");
  const tenantId = params.get("tenantId") ?? "machine";

  const containerRef = useWidgetAutoResize();

  if (!token) {
    return <div className="p-4 text-sm text-red-500">Missing widget token.</div>;
  }

  return (
    <TenantProvider tenantId={tenantId} token={token}>
      <Providers>
        <div
          ref={containerRef}
          className={[
            "w-[360px] max-w-[calc(100vw-16px)]",
            "h-auto min-h-[88px]",            // ✅ critical
            "bg-transparent",                 // ✅ prevents white flash
            "text-white rounded-2xl",
            "overflow-hidden",                // ✅ prevent internal scrollbars
            "p-3",
            "pb-[calc(12px+env(safe-area-inset-bottom))]",
          ].join(" ")}
        >
          <WidgetAgentPanel />
        </div>
      </Providers>
    </TenantProvider>
  );
}
