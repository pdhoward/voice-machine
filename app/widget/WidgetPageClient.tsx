// app/widget/WidgetPageClient.tsx
"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Providers from "@/app/providers";
import { TenantProvider } from "@/context/tenant-context";
import { WidgetAgentPanel } from "@/components/widget/WidgetAgentPanel";

// ---- Hook for auto-resizing iframe container ----
function useWidgetAutoResize() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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

    // Initial report
    sendSize();

    // Watch for internal layout changes
    const ro = new ResizeObserver(sendSize);
    ro.observe(ref.current);

    // Also update on viewport resize (e.g., mobile orientation)
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
  const token = params.get("token"); // created by lib/tenants/widgetToken
  const tenantId = params.get("tenantId") ?? "machine";

  console.log("====widget/widgetpageclient =====")
  console.log(`token - ${token}`)
  console.log(`tenantId - ${tenantId}`)

  const containerRef = useWidgetAutoResize();

  if (!token) {
    return (
      <div className="p-4 text-sm text-red-500">
        Missing widget token.
      </div>
    );
  }

  return (    
    <TenantProvider tenantId={tenantId} token={token}>
      <Providers>     
        <div
          ref={containerRef}
          className="w-full max-w-sm bg-neutral-950 text-white rounded-t-2xl shadow-xl flex flex-col h-[420px]"
        >
          <WidgetAgentPanel />
        </div>  
      </Providers>
    </TenantProvider>
  );
}
