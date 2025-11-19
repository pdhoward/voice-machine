// hooks/use-agentbootstrap.ts
"use client";

import { useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import { useRealtime } from "@/context/realtime-context";

export function useAgentBootstrap() {
  const { tenantId } = useTenant();
  const rt = useRealtime();

  // For now: just set the agent name based on tenantId.
  // You already have richer logic in your main App; we can migrate that here later.
  useEffect(() => {
    if (!tenantId) return;
    // You can hard-code "alloy" or later read from tenant.config.voiceAgent.defaultVoice
    rt.setAgent?.({ name: tenantId, voice: "alloy" });
  }, [tenantId, rt]);

  return rt;
}

