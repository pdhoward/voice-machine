// components/widget/WidgetAgentPanel.tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MicIcon, PhoneOff, X } from "lucide-react";
import { useAgentBootstrap } from "@/hooks/use-agentbootstrap";

export function WidgetAgentPanel() {
  const { status, volume, isConnected, connect, disconnect } = useAgentBootstrap();
  const [bars, setBars] = useState<number[]>(() => Array(50).fill(5));
  const [sessionActive, setSessionActive] = useState(false);

  const isBusy = status === "CONNECTING";
  const label = isConnected ? "End call" : "Start voice";

  // Drive bar animation from volume + connection state
  useEffect(() => {
    if (!sessionActive) {
      setBars(Array(50).fill(5));
      return;
    }
    if (volume > 0.002) {
      setBars(prev =>
        prev.map(() => Math.max(4, Math.random() * volume * 500))
      );
    } else {
      setBars(Array(50).fill(6));
    }
  }, [volume, sessionActive]);

  // Keep local sessionActive in sync with realtime status
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
    // Let the overlay logic remove the iframe on “X”
    if (window && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "sm-voice-widget-close" }, "*");
    }
  };

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-tight">
            Machine Voice Agent
          </span>
          <span className="text-[11px] text-neutral-400">
            Powered by Strategic Machines
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              isConnected ? "bg-emerald-400" : "bg-neutral-500"
            }`}
          />
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body: visualizer */}
      <div className="flex flex-1 items-center justify-center px-3 py-4">
        <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800/80 px-4 py-6 shadow-lg">
          <div className="mb-4 text-center">
            <p className="text-xs text-neutral-400">
              {isConnected
                ? "You’re connected. Just talk."
                : "Tap the mic to start a live conversation."}
            </p>
          </div>

          <div className="flex h-24 items-center justify-center">
            <AnimatePresence>
              <motion.svg
                key="waveform"
                width="100%"
                height="100%"
                viewBox="0 0 1000 200"
                preserveAspectRatio="xMidYMid meet"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35 }}
              >
                {bars.map((height, index) => (
                  <React.Fragment key={index}>
                    <rect
                      x={500 + index * 20 - 490}
                      y={100 - height / 2}
                      width="10"
                      height={height}
                      className={
                        sessionActive
                          ? "fill-neutral-50/85"
                          : "fill-neutral-500/40"
                      }
                    />
                    <rect
                      x={500 - index * 20 - 10}
                      y={100 - height / 2}
                      width="10"
                      height={height}
                      className={
                        sessionActive
                          ? "fill-neutral-50/75"
                          : "fill-neutral-500/30"
                      }
                    />
                  </React.Fragment>
                ))}
              </motion.svg>
            </AnimatePresence>
          </div>

          {/* Mic button */}
          <div className="mt-5 flex flex-col items-center gap-1">
            <motion.button
              type="button"
              onClick={handleToggleSession}
              disabled={isBusy}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 shadow-lg disabled:opacity-60"
              whileTap={{ scale: 0.92 }}
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
            <span className="text-[11px] text-neutral-400">{label}</span>
          </div>
        </div>
      </div>

      {/* Footer (tiny status) */}
      <div className="border-t border-neutral-900 px-3 py-2 text-[11px] text-neutral-500 flex justify-between">
        <span>
          Status:{" "}
          {isBusy
            ? "Connecting…"
            : isConnected
            ? "Live"
            : "Idle"}
        </span>
        <span className="text-neutral-600">
          OpenAI Realtime · Multi-tenant
        </span>
      </div>
    </div>
  );
}
