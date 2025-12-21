// hooks/use-agentbootstrap.ts
"use client";

import { useEffect } from "react";
import { useTenant } from "@/context/tenant-context";
import { useRealtime } from "@/context/realtime-context";
import { useToolsFunctions } from "@/hooks/use-tools";
import { useVisualFunctions } from "@/hooks/use-visuals"; //show_component
import VisualStageHost, { VisualStageHandle } from "@/components/visual-stage-host";
import { fetchTenantHttpTools } from "@/lib/registry/fetchTenantTools";
import { registerHttpToolsForTenant } from "@/lib/agent/registerTenantHttpTools";
import { loadAgentMdRuntime, type AgentRuntimeLoadResult } from "@/lib/registry/agentMdRuntime";

import { coreTools } from "@/types/tools";
import type { ToolDef } from "@/types/tools";

import { useTranscriptSink } from "@/hooks/use-transcript-sink";

export function useAgentBootstrap({ stageRef }: { stageRef: React.RefObject<VisualStageHandle | null> }) {
  
  const visualFunction = useVisualFunctions({ stageRef });
  const { tenantId, agentId, token } = useTenant();
  
  const toolsFunctions = useToolsFunctions(); //locally defined utility tools in hook 

  const showOnStage = (args:any) => stageRef.current?.show?.(args);
  const hideStage = () => stageRef.current?.hide?.();

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
    if (!tenantId || !agentId) return;

    let cancelled = false;

    (async () => {
      try {
        unregisterFunctionsByPrefix("http_");

        // 1) runtime spec (instructions + toolNames)
        const runtime: AgentRuntimeLoadResult = await loadAgentMdRuntime({
          tenantId,
          agentId,
        });

        if (cancelled) return;

        console.log(`===============debug==============`)
        console.log(runtime)

        // 2) register tenant HTTP tools (all available for tenant)
        const httpToolDefs = await registerHttpToolsForTenant({
          tenantId,
          registerFunction,
          showOnStage,
          hideStage,
          cap: 64,
          fetchDescriptors: async () => {
            return await fetchTenantHttpTools(tenantId);
          },
        });

        if (cancelled) return;

        // 3) filter tools by runtime.toolNames (allowlist) if present
        const declared = runtime.toolNames || [];
        const filterEnabled = declared.length > 0;

        const coreNameSet = new Set(
          coreTools
            .filter((t) => t.name !== "show_component")
            .map((t) => t.name)
        );

        const declaredNormalized = declared
          .map((name) => {
            const n = String(name || "").trim();
            if (!n) return "";
            if (n.startsWith("http_")) return n;
            if (coreNameSet.has(n)) return n;
            return `http_${n}`;
          })
          .filter(Boolean);

        const declaredSet = new Set(declaredNormalized);

        const exposedToolDefs: ToolDef[] = [
          ...coreTools.filter((t) => t.name !== "show_component"),
          ...httpToolDefs,
        ].filter((t) => (filterEnabled ? declaredSet.has(t.name) : true));

        // 4) build system prompt from runtime instructions
        const todayIso = new Date().toISOString();
        const SYSTEM_PROMPT = [
          `TODAY_IS: ${todayIso} (use America/Chicago for local comparisons)`,
          runtime.instructions || "",
        ]
          .filter(Boolean)
          .join("\n\n");

        // 5) agent + session update
        setAgent({
          name: runtime.agentName || agentId || tenantId,
          voice: "alloy",
        });

        updateSession({
          tools: exposedToolDefs,
          instructions: SYSTEM_PROMPT,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[useAgentBootstrap] runtime/tool update failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tenantId,
    agentId,
    registerFunction,
    unregisterFunctionsByPrefix,
    setAgent,
    updateSession,
    showOnStage,
    hideStage,
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
