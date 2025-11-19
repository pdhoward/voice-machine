// components/widget/WidgetAgentPanel.tsx
"use client";

import { useState } from "react";
import { useAgentBootstrap } from "@/hooks/use-agentbootstrap";
import { MicIcon, PhoneOff, Send } from "lucide-react";

export function WidgetAgentPanel() {
  const {
    status,
    connect,
    disconnect,
    sendText,
    volume,
  } = useAgentBootstrap();

  const [input, setInput] = useState("");

  const isConnected = status === "CONNECTED";

  const handleConnectDisconnect = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !isConnected) return;
    sendText?.(text);
    setInput("");
  };

  // Very basic time/status for now
  const statusLabel = isConnected ? "Connected" : "Tap to start";

  return (
    <div className="fixed bottom-0 right-0 w-full max-w-sm h-80 bg-neutral-950 text-neutral-100 rounded-t-xl shadow-xl flex flex-col border border-neutral-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
        <div className="text-xs leading-tight">
          <div className="font-semibold">Machine Voice Agent</div>
          <div className="text-[11px] text-neutral-400">
            Powered by Strategic Machines
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] " +
              (isConnected
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700")
            }
          >
            <span
              className={
                "mr-1 h-1.5 w-1.5 rounded-full " +
                (isConnected ? "bg-emerald-400" : "bg-neutral-500")
              }
            />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Body: placeholder for visualizer */}
      <div className="flex-1 flex flex-col items-center justify-center px-3">
        {/* Simple volume-based dot for now; later drop your full visualizer here */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-[11px] text-neutral-400 mb-1">
            {isConnected
              ? "You’re connected. Speak or type your question."
              : "Tap to start a conversation."}
          </div>

          <div className="relative flex items-center justify-center w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-neutral-800" />
            <div
              className="relative flex items-center justify-center w-11 h-11 rounded-full bg-neutral-900 border border-neutral-700"
              style={{
                boxShadow: isConnected
                  ? "0 0 0 2px rgba(34,197,94,0.3)"
                  : "0 0 0 2px rgba(148,163,184,0.25)",
              }}
            >
              {isConnected ? (
                <PhoneOff size={18} className="text-red-400" />
              ) : (
                <MicIcon size={18} className="text-sky-400" />
              )}
            </div>
            {/* cheap “volume” ring */}
            {isConnected && (
              <div
                className="absolute inset-0 rounded-full border border-emerald-500/40 transition-transform"
                style={{
                  transform:
                    volume && volume > 0
                      ? `scale(${1 + Math.min(volume * 5, 0.6)})`
                      : "scale(1)",
                }}
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleConnectDisconnect}
            className="mt-1 inline-flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs text-neutral-100 border border-neutral-700"
          >
            {isConnected ? "End call" : "Start call"}
          </button>
        </div>
      </div>

      {/* Bottom input row */}
      <form
        onSubmit={handleSubmit}
        className="px-3 py-2 border-t border-neutral-800 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isConnected
              ? "Type a quick question…"
              : "Start call to type or talk…"
          }
          className="flex-1 bg-neutral-900 text-[12px] text-neutral-100 placeholder-neutral-500 rounded-lg border border-neutral-700 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
          disabled={!isConnected}
        />
        <button
          type="submit"
          disabled={!isConnected || !input.trim()}
          className="inline-flex items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 h-8 w-8"
          title="Send"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
