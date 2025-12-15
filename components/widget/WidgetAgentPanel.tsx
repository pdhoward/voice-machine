// components/widget/WidgetAgentPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

import VisualStageHost, { VisualStageHandle } from "@/components/visual-stage-host";
import { useAgentBootstrap } from "@/hooks/use-agentbootstrap";
import TranscriptDialogTrigger from "@/components/triggers/TranscriptDialogTrigger";
import VoicePill from "@/components/widget/VoicePill";


type ConvItem = {
  id: string;
  role: string;
  text?: string;
  timestamp: number;
};

export function WidgetAgentPanel() {
  
  const stageRef = useRef<VisualStageHandle | null>(null);

  const { status, volume, isConnected, connect, disconnect, conversation } =
    useAgentBootstrap({ stageRef });

  const [displayName, setDisplayName] = useState("AI Voice Agent");
  const [expanded, setExpanded] = useState(false);

  // NEW: controls whether the widget should expand to show visuals
  const [visualActive, setVisualActive] = useState(false);

  const isBusy = status === "CONNECTING";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("displayName");
      if (fromUrl && fromUrl.trim().length > 0) setDisplayName(fromUrl.trim());
    } catch {}
  }, []);

  const transcriptConversation: ConvItem[] = useMemo(() => {
    if (!Array.isArray(conversation)) return [];
    return conversation.map((m: any) => ({
      id: m.id ?? `${m.role}-${m.timestamp ?? Date.now()}`,
      role: m.role ?? "system",
      text: m.text ?? m.content ?? "",
      timestamp: m.timestamp ?? Date.now(),
    }));
  }, [conversation]);

  const transcriptEnabled = isConnected && transcriptConversation.length > 0;

  const handleClose = () => {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "sm-voice-widget-close" }, "*");
    }
  };

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleTranscriptDownload = () => {
    if (!transcriptConversation.length) return;

    const txt = transcriptConversation
      .map((m) => {
        const time = new Date(m.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `[${time}] ${m.role}: ${m.text ?? ""}`;
      })
      .join("\n");

    const json = JSON.stringify(transcriptConversation, null, 2);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    triggerDownload(`transcript-${stamp}.txt`, txt);
    triggerDownload(`transcript-${stamp}.json`, json);
  };

  const onStart = () => {
    if (isBusy) return;
    connect();
    // default to subtle UI (pill-only)
    setExpanded(false);
  };

  const onEnd = () => {
    disconnect();
    setExpanded(false);
    setVisualActive(false);
  };

  useEffect(() => {
    if (!isConnected) {
      setExpanded(false);
      setVisualActive(false);
    }
  }, [isConnected]);

  // If visuals become active, we can automatically open the drawer
  useEffect(() => {
    if (visualActive) setExpanded(true);
  }, [visualActive]);

  return (
     <div className="flex w-full flex-col gap-3">
      {/* ✅ NOTICE: host is always mounted so stageRef is always valid */}
      <VisualStageHost ref={stageRef} onActiveChange={setVisualActive as any} />

      {/* VISUAL TRAY (only shows a container when needed) */}
      <AnimatePresence>
        {(visualActive || expanded) && (
          <motion.div
            className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-3">
              {/* your tray chrome */}
              {/* IMPORTANT: tray no longer contains VisualStageHost */}
              <div className="text-[10px] text-neutral-400">Visual response</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER (expanded info + transcript) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-50 shadow-xl"
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18 }}
            role="region"
            aria-label="Voice agent drawer"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold tracking-tight">
                  {displayName}
                </span>
                <span className="text-[10px] text-neutral-400">
                  
                </span>
              </div>

              <div className="flex items-center gap-2">                

                 {/* Transcript trigger */}
                <div
                  className={
                    transcriptEnabled
                      ? "transition"
                      : "cursor-not-allowed pointer-events-none text-neutral-600 opacity-40"
                  }
                >
                  <TranscriptDialogTrigger
                    conversation={transcriptConversation}
                    onDownload={handleTranscriptDownload}
                    active={transcriptEnabled}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                  aria-label="Close widget"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="px-4 py-4">
              <div className="rounded-xl border border-neutral-800/80 bg-gradient-to-br from-neutral-900 to-neutral-950 p-4">
                <p className="text-xs text-neutral-300">
                  {isConnected
                    ? "You’re connected. Speak naturally and your assistant will respond."
                    : `Press Start to begin a live conversation with ${displayName}.`}
                </p>

                <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={[
                        "h-2 w-2 rounded-full",
                        isBusy
                          ? "bg-amber-400"
                          : isConnected
                          ? "bg-emerald-400"
                          : "bg-neutral-500",
                      ].join(" ")}
                    />
                    <span>{isBusy ? "Connecting…" : isConnected ? "Live" : "Idle"}</span>
                  </span>

                  <span className="text-neutral-500">
                    {isConnected ? "Tap pill to end" : "Tap pill to start"}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-900 px-3 py-2 text-[11px] text-neutral-500">
              <span className="text-neutral-600">Built by Strategic Machines</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PILL (always, in-flow, drives collapsed height) */}
      <VoicePill
        displayName={displayName}
        status={status}
        isConnected={isConnected}
        volume={volume}
        onStart={onStart}
        onEnd={onEnd}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
      />
    </div>
  );
}
