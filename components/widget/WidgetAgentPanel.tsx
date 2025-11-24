// components/widget/WidgetAgentPanel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MicIcon, PhoneOff, X } from "lucide-react";
import { useAgentBootstrap } from "@/hooks/use-agentbootstrap";
import TranscriptDialogTrigger from "@/components/triggers/TranscriptDialogTrigger";

const BAR_COUNT = 24;

type ConvItem = {
  id: string;
  role: string;
  text?: string;
  timestamp: number;
};

export function WidgetAgentPanel() {
  const {
    status,
    volume,
    isConnected,
    connect,
    disconnect,
    conversation,
  } = useAgentBootstrap();

  const [bars, setBars] = useState<number[]>(() =>
    Array(BAR_COUNT).fill(4)
  );
  const [sessionActive, setSessionActive] = useState(false);

  const isBusy = status === "CONNECTING";
  const label = isConnected ? "End call" : "Start voice";

  const statusLabel = useMemo(() => {
    if (isBusy) return "Connecting…";
    if (isConnected) return "Live";
    return "Idle";
  }, [isBusy, isConnected]);

  const statusColor = useMemo(() => {
    if (isBusy) return "bg-amber-400/90";
    if (isConnected) return "bg-emerald-400/90";
    return "bg-neutral-500/80";
  }, [isBusy, isConnected]);

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

  // Waveform animation
   useEffect(() => {
    if (!sessionActive) {
      // very low, uniform idle state
      setBars(Array(BAR_COUNT).fill(5));
      return;
    }

    if (volume > 0.002) {
      // keep motion subtle and compact
      const scale = Math.min(volume * 350, 18);
      setBars(() =>
        Array.from({ length: BAR_COUNT }, () => {
          const base = 4 + Math.random() * scale;
          return Math.max(3, Math.min(base, 22));
        })
      );
    } else {
      // gentle idle breathing, almost flat
      setBars((prev) =>
        prev.map((v) => {
          const jitter = (Math.random() - 0.5) * 0.7;
          return Math.max(3, Math.min(v + jitter, 8));
        })
      );
    }
  }, [volume, sessionActive]);


  useEffect(() => {
    setSessionActive(isConnected);
  }, [isConnected]);

  const handleToggleSession = async () => {
    if (isConnected) {
      disconnect();
      return;
    }
    connect();
  };

  const handleClose = () => {
    if (
      typeof window !== "undefined" &&
      window.parent &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        { type: "sm-voice-widget-close" },
        "*"
      );
    }
  };

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });
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

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold tracking-tight">
            Machine Voice Agent
          </span>
          <span className="text-[11px] text-neutral-400">
            Powered by Strategic Machines
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Transcript trigger (disabled/grey when not live, green when live) */}
          <div
            className={
              transcriptEnabled
                ? "transition"
                : "text-neutral-600 opacity-40 cursor-not-allowed pointer-events-none"
            }
          >
            <TranscriptDialogTrigger
              conversation={transcriptConversation}
              onDownload={handleTranscriptDownload}
              active={transcriptEnabled}
            />
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                isConnected ? "bg-emerald-400" : "bg-neutral-500"
              }`}
            />
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-neutral-950 ${statusColor}`}
            >
              {statusLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

      </div>

      {/* Body: visualizer */}
      <div className="flex flex-1 items-center justify-center px-3 py-4">
        <div className="relative flex w-full max-w-md flex-col rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-neutral-900 to-neutral-950 px-4 py-5 shadow-lg sm:px-5 sm:py-6">
          {sessionActive && (
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-emerald-500/5 blur-2xl" />
          )}

          <div className="mb-3 text-center sm:mb-4">
            <p className="text-[11px] leading-snug text-neutral-400 sm:text-xs">
              {isConnected
                ? "You’re connected. Speak naturally and your assistant will respond."
                : "Tap the mic to start a live conversation with your hotel agent."}
            </p>
          </div>

         <div className="flex h-18 items-center justify-center sm:h-22">
          <AnimatePresence>
            <motion.div
              key="waveform-container"
              className="relative flex h-full items-center justify-center mx-auto"
              style={{
                width: "88%",          
                maxWidth: "260px",     // responsive on desktop + mobile
              }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25 }}
            >
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 100 26"
                preserveAspectRatio="xMidYMid meet"
                className="mx-auto block"  // ← **forces the SVG itself to center**
              >
                <line
                  x1="0"
                  y1="13"
                  x2="100"
                  y2="13"
                  className="stroke-neutral-800"
                  strokeWidth="0.25"
                />

               {bars.map((height, index) => {
                const barWidth = 100 / (BAR_COUNT * 4);      // keep your chosen density
                const gap = barWidth * 0.35;

                // 🔹 total width of all bars + gaps
                const totalBarsWidth =
                  BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap;

                // 🔹 starting x so the whole group is centered in [0, 100]
                const startX = (100 - totalBarsWidth) / 2;

                const x = startX + index * (barWidth + gap);

                const barHeight = height / 4.2;
                const y = 13 - barHeight / 2;

                const liveClass =
                  index % 3 === 0
                    ? "fill-emerald-400/90"
                    : "fill-cyan-300/80";

                const idleClass = "fill-neutral-700/70";

                return (
                  <rect
                    key={index}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={barWidth}
                    className={sessionActive ? liveClass : idleClass}
                  />
                );
              })}

              </svg>
            </motion.div>
          </AnimatePresence>
        </div>




          {/* Mic button */}
          <div className="mt-4 flex flex-col items-center gap-1.5 sm:mt-5">
            <motion.button
              type="button"
              onClick={handleToggleSession}
              disabled={isBusy}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 shadow-lg ring-2 ring-neutral-100/40 ring-offset-2 ring-offset-neutral-900 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-14"
              whileTap={{ scale: 0.92 }}
              aria-label={label}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isConnected ? (
                  <motion.span
                    key="phone-off"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.2 }}
                    className="text-red-600"
                  >
                    <PhoneOff size={22} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="mic"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.2 }}
                    className="text-sky-600"
                  >
                    <MicIcon size={22} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            <span className="text-[11px] text-neutral-400">
              {label}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-neutral-900 px-3 py-2 text-[11px] text-neutral-500">
        <span>
          Status:{" "}
          <span className="font-medium text-neutral-300">
            {statusLabel}
          </span>
        </span>
        <span className="hidden text-neutral-600 sm:inline">
          OpenAI Realtime · Multi-tenant
        </span>
      </div>
    </div>
  );
}
