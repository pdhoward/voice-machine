"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

import { useRealtime } from "@/context/realtime-context";
import { useTenant } from "@/context/tenant-context";

import Visualizer from "@/components/visualizer";
import VisualStageHost, { VisualStageHandle } from "@/components/visual-stage-host";
import ControlsBar from "@/components/control-bar";
import {
  AgentDialogTrigger,
  LogsDialogTrigger,
  TranscriptDialogTrigger,
  UsageDialogTrigger,
  SelfTestDialogTrigger,
} from "@/components/triggers";

import { Send } from "lucide-react";
import { motion } from "motion/react";

import { useToolsFunctions } from "@/hooks/use-tools";
import { useVisualFunctions } from "@/hooks/use-visuals";
import { useTranscriptSink } from "@/hooks/use-transcript-sink";

import { Diagnostics } from "@/components/diagnostics";

import { fetchTenantHttpTools } from "@/lib/registry/fetchTenantTools";
import { registerHttpToolsForTenant } from "@/lib/agent/registerTenantHttpTools";
import type { ToolDef } from "@/types/tools";
import { coreTools } from "@/types/tools";

import { loadAgentMdRuntime, type AgentRuntimeLoadResult } from "@/lib/registry/agentMdRuntime";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type Variant = "neutral" | "success" | "danger" | "warning";

type AgentSelection = {
  tenantId: string;
  tenantName: string;
  agentId: string;
  agentName: string;
};

const DEFAULT_TENANT_ID = "machine";
const DEFAULT_TENANT_NAME = "Strategic Machines";
const DEFAULT_AGENT_ID = "agent_sales_v1"
const DEFAULT_AGENT_NAME = "Sales Agent"

// ---------- page ----------
const App: React.FC = () => {
  const didMountRef = useRef(false);

  const [isOpen, setIsOpen] = useState(true);
  const [inputText, setInputText] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [timer, setTimer] = useState<number>(0);
  const [componentName, setComponentName] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntimeLoadResult | null>(null);
  const [agentVariant, setAgentVariant] = useState<Variant>("neutral");

  const { tenantId: contextTenantId } = useTenant();
  const [selection, setSelection] = useState<AgentSelection | null>(() => ({
      tenantId: DEFAULT_TENANT_ID,
      tenantName: DEFAULT_TENANT_NAME,
      agentId: DEFAULT_AGENT_ID,
      agentName: DEFAULT_AGENT_NAME,
    }));

  const effectiveTenantId = selection?.tenantId || contextTenantId || DEFAULT_TENANT_ID;
  const effectiveAgentId = selection?.agentId || "";

  const tenantDisplayName = selection?.tenantName || effectiveTenantId || "Tenant";
  const agentDisplayName =
    agentRuntime?.agentName ||
    selection?.agentName ||
    (effectiveAgentId ? effectiveAgentId : "Select an agent");

  // runtime status for UI (agent trigger color + dialog summary)
  const [runtimeStatus, setRuntimeStatus] = useState<{ warnings: string[]; errors: string[] }>({
    warnings: [],
    errors: [],
  });

  // anchor for the visualizer card
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // anchor for the visual components
  const stageRef = useRef<VisualStageHandle | null>(null);

  const toolsFunctions = useToolsFunctions();
  const visualFunction = useVisualFunctions({ stageRef });

  const showOnStage = useCallback((args: any) => {
    stageRef.current?.show?.(args);
  }, []);

  const hideStage = useCallback(() => {
    stageRef.current?.hide?.();
  }, []);

  const {
    status,
    conversation,
    volume,
    events,
    connect,
    disconnect,
    sendText,
    setAgent,
    updateSession,
    registerFunction,
    unregisterFunctionsByPrefix,
    setMicEnabled,
    forceToolCall,
    getClient,
  } = useRealtime();

  // transcript sink to mongo
  useTranscriptSink(conversation as any);

  // capture transcripts when browser closed or tab hidden
  useEffect(() => {
    const finalize = () => {
      navigator.sendBeacon?.(
        "/api/transcripts/finalize",
        new Blob([], { type: "application/json" })
      );
    };

    const onPageHide = () => finalize();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") finalize();
    };

    window.addEventListener("pagehide", onPageHide, { capture: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide, { capture: true } as any);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Push initial agent config and whenever selection/voice changes
  useEffect(() => {
    const name = effectiveAgentId || effectiveTenantId || "agent";
    setAgent({ name, voice });
  }, [effectiveTenantId, effectiveAgentId, voice, setAgent]);

  // ✅ Safe reconnect on agent change (gated; only if currently connected)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (status !== "CONNECTED") return;
    if (!effectiveTenantId || !effectiveAgentId) return;

    (async () => {
      try {
        await fetch("/api/transcripts/finalize", { method: "POST" });
      } catch {}
      disconnect();
      setTimeout(() => connect(), 150);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTenantId, effectiveAgentId]);

  // register core/local tools once
  useEffect(() => {
    console.log("[App] core tools registration effect START");

    const nameMap: Record<string, string> = {
      timeFunction: "getCurrentTime",
      backgroundFunction: "changeBackgroundColor",
      partyFunction: "partyMode",
      launchWebsite: "launchWebsite",
      copyToClipboard: "copyToClipboard",
      scrapeWebsite: "scrapeWebsite",
      visualFunction: "show_component",
    };

    Object.entries(toolsFunctions).forEach(([localName, fn]) => {
      const toolName = nameMap[localName];
      if (toolName && typeof fn === "function") registerFunction(toolName, fn);
    });

    Object.entries(visualFunction).forEach(([localName, fn]) => {
      const toolName = nameMap[localName];
      if (toolName && typeof fn === "function") registerFunction(toolName, fn);
    });

    console.log("[App] core tools registration effect END");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ tenant + agent runtime load, http-tool registration, session update
  useEffect(() => {
    if (!effectiveTenantId || !effectiveAgentId) {
      setAgentVariant("neutral");
      setRuntimeStatus({ warnings: [], errors: [] });
      setAgentRuntime(null);
      return;
    }

     setAgentVariant("neutral");
     setRuntimeStatus({ warnings: [], errors: [] });

    let cancelled = false;

    (async () => {
      try {
        unregisterFunctionsByPrefix("http_");

        // 1) runtime spec (instructions + toolNames + warnings/errors)
        const runtime: AgentRuntimeLoadResult = await loadAgentMdRuntime({
          tenantId: effectiveTenantId,
          agentId: effectiveAgentId,
        });

        if (cancelled) return;

        // ✅ store it so UI can reflect it
        setAgentRuntime(runtime);

        // ✅ derive button color from the same runtime result
        const nextVariant: Variant =
          runtime.errors.length ? "danger" :
          runtime.warnings.length ? "warning" :
          runtime.ok ? "success" :
          "neutral";

        setAgentVariant(nextVariant);       

        setRuntimeStatus({
          warnings: runtime.warnings || [],
          errors: runtime.errors || [],
        });
        

        // 2) register tenant HTTP tools (API descriptors)

        ////////////////////////////////////////////////////
        /////  note that the set of tool descriptors   ////
        ////   defined by the client and fetched from  ///
        ///    the db are prepended with 'http_' to    //
        //      avoid a name collision with core      //
        ///////////////////////////////////////////////
        const httpToolDefs = await registerHttpToolsForTenant({
          tenantId: effectiveTenantId,
          registerFunction,
          showOnStage,
          hideStage,
          cap: 64,
          fetchDescriptors: async () => {
            const rows = await fetchTenantHttpTools(effectiveTenantId);
            return rows;
          },
        });    
        
        if (cancelled) return;

        // 3) filter tools by runtime toolNames if present; otherwise allow all
        const declared = runtime.toolNames || [];
        const filterEnabled = declared.length > 0;

        // Build a lookup of core tool names (excluding show_component - hide from agent)
        const coreNameSet = new Set(
          coreTools
            .filter((t) => t.name !== "show_component")
            .map((t) => t.name)
        );

        // Normalize declared tool names so they match runtime tool naming conventions
        const declaredNormalized = declared.map((name) => {
          const n = String(name || "").trim();
          if (!n) return "";
          if (n.startsWith("http_")) return n;          // already prefixed
          if (coreNameSet.has(n)) return n;             // core tool
          return `http_${n}`;                           // assume registry/http tool
        }).filter(Boolean);

        // Use a Set for faster membership checks
        const declaredSet = new Set(declaredNormalized);

        const exposedToolDefs: ToolDef[] = [
          ...coreTools.filter((t) => t.name !== "show_component"),
          ...httpToolDefs,
        ].filter((t) => (filterEnabled ? declaredSet.has(t.name) : true));   
        
        //  NOTIFY THE registry-context for reporting on the tool panel
        window.dispatchEvent(
          new CustomEvent("tool-allowlist-updated", {
            detail: {
              allowed: exposedToolDefs.map((t) => t.name),              
              declared: declaredNormalized,
              filterEnabled,
              tenantId: effectiveTenantId,
              agentId: effectiveAgentId,
            },
          })
        );


        // 4) build system prompt from runtime instructions
        const todayIso = new Date().toISOString();
        const SYSTEM_PROMPT = [
          `TODAY_IS: ${todayIso} (use America/Chicago for local comparisons)`,
          runtime.instructions || "",
        ]
          .filter(Boolean)
          .join("\n\n");

        // 5) single session update
        updateSession({ tools: exposedToolDefs, instructions: SYSTEM_PROMPT });
        window.dispatchEvent(new CustomEvent("tool-registry-updated"));
      } catch (e) {
        if (cancelled) return; 
        console.error("[App] runtime/tool update failed:", e);
        setRuntimeStatus({
          warnings: [],
          errors: [e instanceof Error ? e.message : String(e)],
        });
        setAgentVariant("danger");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveTenantId,
    effectiveAgentId,
    unregisterFunctionsByPrefix,
    registerFunction,
    updateSession,
    showOnStage,
    hideStage,
  ]);

  // timer based on connection status
  useEffect(() => {
    let id: any = null;
    if (status === "CONNECTED") id = setInterval(() => setTimer((t) => t + 1), 1000);
    else setTimer(0);
    return () => {
      if (id) clearInterval(id);
    };
  }, [status]);

  const isConnected = status === "CONNECTED";

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // mute/unmute mic
  const onMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    setMicEnabled?.(!next);
  };

  const onStartCall = () => connect();

  const onEndCall = async () => {
    try {
      await fetch("/api/transcripts/finalize", { method: "POST" });
    } catch {}
    disconnect();
  };

  const downloadTranscription = () => {
    const content = conversation
      .map((m) => `[${new Date(m.timestamp).toLocaleString()}] ${m.role}: ${m.text}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black bg-opacity-50 z-40 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Centered stage */}
      <div className="mt-20 p-4 flex-1 flex items-center justify-center">
        <ErrorBoundary
          fallback={
            <div className="p-4 text-center text-red-500">
              <h2>Voice Agent Error</h2>
              <p>Something went wrong with the connection. Please try again.</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
              >
                Reload
              </button>
            </div>
          }
        >
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative w-[240px] h-[480px] bg-neutral-900 rounded-[32px] border-2 border-neutral-800 shadow-xl overflow-hidden">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-16 h-4 bg-neutral-800 rounded-b-lg z-10" />
              <div className="absolute top-6 bottom-0 left-0 right-0 flex flex-col">
                {/* top content */}
                <div className="flex-1 p-3">
                  <div className="h-full flex flex-col text-neutral-200">
                    <div className="flex justify-between items-center mb-2 px-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-neutral-100 truncate">
                          {tenantDisplayName}
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate">
                          {agentDisplayName}
                        </div>
                      </div>

                      <span className="text-xs">{formatTime(timer)}</span>
                    </div>

                    {/* card: compact, stationary (visualizer + small input) */}
                    <div className="flex-1 mb-4 max-w-full box-sizing-border-box">
                      <motion.div
                        className="w-full max-w-md bg-neutral-900/70 text-card-foreground rounded-xl border border-neutral-800 shadow-sm p-4 space-y-3"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                      >
                        <Visualizer
                          volume={volume}
                          isConnected={isConnected}
                          onStart={onStartCall}
                          onEnd={onEndCall}
                        />

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const text = inputText.trim();
                            if (!text) return;
                            sendText(text);
                            setInputText("");
                          }}
                          className="mt-1 flex items-center gap-2"
                        >
                          <input
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={isConnected ? "Type a quick message…" : "Connect to send messages"}
                            disabled={!isConnected}
                            className="flex-1 text-[11px] leading-[1.1rem] bg-neutral-800 text-neutral-200 placeholder-neutral-500 rounded-lg border border-neutral-700 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-60"
                          />
                          <button
                            type="submit"
                            disabled={!isConnected || !inputText.trim()}
                            className="inline-flex items-center justify-center rounded-md bg-neutral-600 hover:bg-neutral-500 disabled:opacity-50 text-white h-7 px-2"
                            title="Send"
                          >
                            <Send size={14} />
                          </button>
                        </form>
                      </motion.div>

                      <div ref={messagesEndRef} />
                    </div>

                    {isConnected && (
                      <div className="text-xs text-neutral-400 text-center p-2">Status: Open</div>
                    )}
                  </div>
                </div>
                <div className="px-3 pb-2">
                  <div className="text-[11px] text-neutral-500 text-center">
                    Select Tenant &amp; Agent below to change demo
                  </div>
                </div>

                {/* bottom controls */}
                <div className="p-3 border-t border-neutral-800">
                  <ControlsBar
                    isConnected={isConnected}
                    isMuted={isMuted}
                    onMute={onMute}
                    onStartCall={onStartCall}
                    onEndCall={onEndCall}
                    agentTrigger={
                      <AgentDialogTrigger
                        defaultTenantId={contextTenantId || DEFAULT_TENANT_ID}
                        value={selection ?? undefined}
                        onChange={(next) => {
                          setAgentVariant("neutral");
                          setAgentRuntime(null);
                          setRuntimeStatus({ warnings: [], errors: [] });
                          setSelection(next);
                        }}
                        title="Select Tenant + Agent"
                        status={runtimeStatus}
                        variant={agentVariant}
                      />
                    }
                    logsTrigger={<LogsDialogTrigger events={events} />}
                    transcriptTrigger={
                      <TranscriptDialogTrigger
                        conversation={conversation as any}
                        onDownload={downloadTranscription}
                      />
                    }
                    usageTrigger={<UsageDialogTrigger events={events} />}
                    selfTest={
                      <SelfTestDialogTrigger
                        status={status}
                        isConnected={isConnected}
                        connect={connect}
                        disconnect={disconnect}
                        sendText={sendText}
                        conversation={conversation}
                        componentName={componentName}
                        events={events}
                        forceToolCall={forceToolCall}
                        getEventsCount={() => events.length}
                        mockShowComponent={(name) => setComponentName(name)}
                      />
                    }
                  />
                </div>
              </div>

              {/* close X */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-2 right-2 text-neutral-400 text-sm"
                title="Close"
              >
                ×
              </button>
            </div>
          </motion.div>
        </ErrorBoundary>
      </div>

      {/* Visual stage host */}
      <VisualStageHost ref={stageRef} />

      {/* Diagnostics (WebRTC telemetry) */}
      <Diagnostics status={status} volume={volume} events={events} getClient={getClient} />
    </motion.div>
  );
};

export default App;
