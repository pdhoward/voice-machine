// app/widget/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { TenantProvider } from "@/context/tenant-context";
import { WidgetAgentPanel } from "@/components/widget/WidgetAgentPanel";

export default function WidgetPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const tenantIdFromQuery = params.get("tenantId");

  if (!token || !tenantIdFromQuery) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-200 text-sm">
        Invalid widget session. Please refresh the page.
      </div>
    );
  }

  // We override tenantId + token here, even if an outer TenantProvider exists.
  return (
    <TenantProvider tenantId={tenantIdFromQuery} token={token}>
      <div className="h-screen w-screen bg-transparent text-neutral-100">
        <WidgetAgentPanel />
      </div>
    </TenantProvider>
  );
}

