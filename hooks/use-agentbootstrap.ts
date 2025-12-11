// hooks/use-agentbootstrap.ts
"use client";

import { useEffect, useRef } from "react";
import { useTenant } from "@/context/tenant-context";
import { useRealtime } from "@/context/realtime-context";
import { useToolsFunctions } from "@/hooks/use-tools";
import { useVisualFunctions } from "@/hooks/use-visuals"; //show_component
import VisualStageHost, { VisualStageHandle } from "@/components/visual-stage-host";
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

  const stageRef = useRef<VisualStageHandle | null>(null);
  const toolsFunctions = useToolsFunctions(); //locally defined utility tools in hook
  const visualFunction = useVisualFunctions({stageRef}); //locally defined visual UI tool in hook

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

  ////////////////////////////////////////////////////////////////
  // Bootstrap tools + system prompt whenever tenant changes   //
  //////////////////////////////////////////////////////////////

    // register the local set of tools once
  useEffect(() => {
    console.log("[App] tools registration effect START");

    // localName for Toolbox functions -> tool name in the model schema
    const nameMap: Record<string, string> = {
      timeFunction: "getCurrentTime",
      backgroundFunction: "changeBackgroundColor",
      partyFunction: "partyMode",
      launchWebsite: "launchWebsite",
      copyToClipboard: "copyToClipboard",
      scrapeWebsite: "scrapeWebsite",
      visualFunction: "show_component"
      //expose more tools as needed
    };

    // register utility toolbox functions
    Object.entries(toolsFunctions).forEach(([localName, fn]) => {
      const toolName = nameMap[localName];
      if (toolName && typeof fn === "function") {
        console.log("[App] registerFunction:", toolName, "from localName:", localName);
        registerFunction(toolName, fn);
      } else {
        console.log("[App] skip localName:", localName, "->", toolName, "fn type:", typeof fn);
      }
    });

    // register visual UI function = show_component
    Object.entries(visualFunction).forEach(([localName, fn]) => {
      const toolName = nameMap[localName];
      if (toolName && typeof fn === "function") {
        console.log("[App] registerFunction:", toolName, "from localName:", localName);
        registerFunction(toolName, fn);
      } else {
        console.log("[App] skip localName:", localName, "->", toolName, "fn type:", typeof fn);
      }
    });      

      console.log("[App] CORE tools registration effect END");
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);   

  /////////////////////end core tool load///////////////

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

         // Build instructions once (tenant prompt + all exposed tools)
        const { name: agentName, base } = selectPromptForTenant(
          tenantId,
          promptsJson as StructuredPrompt | StructuredPrompt[]
        );

        const exposedToolDefs: ToolDef[] = [
          ...coreTools.filter((t) => t.name !== "show_component"), // hide this tool from model 
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
