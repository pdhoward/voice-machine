// hooks/use-agentbootstrap.ts
"use client";

import { useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import { useRealtime } from "@/context/realtime-context";

import { fetchTenantHttpTools } from "@/lib/registry/fetchTenantTools";
import { registerHttpToolsForTenant } from "@/lib/agent/registerTenantHttpTools";
import {
  selectPromptForTenant,
  buildInstructions,
} from "@/lib/agent/managePrompts";

import { coreTools } from "@/types/tools";
import type { ToolDef } from "@/types/tools";
import type { StructuredPrompt } from "@/types/prompt";

import promptsJson from "@/promptlibrary/prompts.json";
import { useTranscriptSink } from "@/hooks/use-transcript-sink";

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
    conversation,
  } = useRealtime();

  // Bootstrap tools + system prompt whenever tenant changes
  useEffect(() => {
    if (!tenantId) return;

    (async () => {
      try {
        unregisterFunctionsByPrefix("http_");

        const httpToolDefs = await registerHttpToolsForTenant({
          tenantId,
          registerFunction,
          showOnStage: () => {},
          hideStage: () => {},
          cap: 64,
          fetchDescriptors: async () => {
            return await fetchTenantHttpTools(tenantId);
          },
        });

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

        setAgent({
          name: agentName || tenantId,
          voice: "alloy",
        });

        updateSession({
          tools: exposedToolDefs,
          instructions: SYSTEM_PROMPT,
        });
      } catch (err) {
        console.error(
          "[useAgentBootstrap] error bootstrapping agent",
          err
        );
      }
    })();
  }, [
    tenantId,
    registerFunction,
    unregisterFunctionsByPrefix,
    setAgent,
    updateSession,
  ]);

  // 🔹 Transcripts for BOTH console + widget:
  // - console: token will be undefined, source defaults to "console"
  // - widget: token + tenantId are set from TenantProvider
  useTranscriptSink(conversation as any, {
    authToken: token ?? undefined,
    tenantId,
    source: "widget",
  });

  const isConnected = status === "CONNECTED";

  return {
    status,
    volume,
    isConnected,
    connect,
    disconnect,
    sendText,
    conversation,
  };
}
