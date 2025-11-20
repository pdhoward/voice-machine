
// hooks/use-agentbootstrap.ts
"use client";

import { useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import { useRealtime } from "@/context/realtime-context";

import { fetchTenantHttpTools } from "@/lib/registry/fetchTenantTools";
import { registerHttpToolsForTenant } from "@/lib/agent/registerTenantHttpTools";
import { selectPromptForTenant, buildInstructions } from "@/lib/agent/managePrompts";

import { coreTools } from "@/types/tools";
import type { ToolDef } from "@/types/tools";
import type { StructuredPrompt } from "@/types/prompt";

import promptsJson from "@/promptlibrary/prompts.json";

export function useAgentBootstrap() {
  const { tenantId, token } = useTenant();

  const {
    status,
    volume,
    connect,
    disconnect,
    sendText,
    setAgent,
    updateSession,
    registerFunction,
    unregisterFunctionsByPrefix,
  } = useRealtime();

  // Bootstrap tools + system prompt whenever tenant changes
  useEffect(() => {
    if (!tenantId) return;

    (async () => {
      try {
        // Clear tenant-scoped tools (if you name them with "http_" prefix)
        unregisterFunctionsByPrefix("http_");

        // Register HTTP tools for this tenant
        const httpToolDefs = await registerHttpToolsForTenant({
          tenantId,
          registerFunction,
          // For widget, we don't (yet) show rich visual components
          showOnStage: () => {},
          hideStage: () => {},
          cap: 64,
          fetchDescriptors: async () => {
            return await fetchTenantHttpTools(tenantId);
          },
        });

        // Prompt selection + instructions
        const { name: agentName, base } = selectPromptForTenant(
          tenantId,
          promptsJson as StructuredPrompt | StructuredPrompt[]
        );

        const exposedToolDefs: ToolDef[] = [
          ...coreTools,
          ...httpToolDefs,
        ];

        const todayIso = new Date().toISOString();
        const SYSTEM_PROMPT = [
          `TODAY_IS: ${todayIso} (use America/Chicago for local comparisons)`,
          buildInstructions(base, exposedToolDefs),
        ].join("\n\n");

        // Configure the agent for this session
        setAgent({
          name: agentName || tenantId,
          voice: "alloy",
        });

        updateSession({
          tools: exposedToolDefs,
          instructions: SYSTEM_PROMPT,
        });
      } catch (err) {
        console.error("[useAgentBootstrap] error bootstrapping agent", err);
      }
    })();
  }, [
    tenantId,
    registerFunction,
    unregisterFunctionsByPrefix,
    setAgent,
    updateSession,
  ]);

  const isConnected = status === "CONNECTED";

  return {
    status,
    volume,
    isConnected,
    connect,
    disconnect,
    sendText,
  };
}

