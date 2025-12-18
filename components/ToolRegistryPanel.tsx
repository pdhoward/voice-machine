"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useToolRegistry } from "@/context/registry-context";

export default function ToolRegistryPanel() {
  const {
    entries,
    sourceStatus,
    stats,
    isLoading,
    refresh,
    enablePolling,
    disablePolling,
    setVerboseLogging,
    allowed
  } = useToolRegistry();

  const [open, setOpen] = useState(false);
  const [showCode, setShowCode] = useState<string | null>(null);
  const [logsOn, setLogsOn] = useState(false);

  // Close on Escape for better UX
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const counts = useMemo(
  () => ({
    total: entries.length,
    allowed: allowed?.size ?? 0,
    getter: sourceStatus.getter.keys.length,
    realtime: sourceStatus.realtime.keys.length,
    global: sourceStatus.global.keys.length,
  }),
  [entries, allowed, sourceStatus]
);


  return (
    <div
      className={[
        // Always on top of VisualStage (z-[120]); sit even higher
        "fixed z-[130]",
       // MOBILE: bottom-right, lifted so it doesn't mask footer/monitor
        "right-3 bottom-[110px]",
        // DESKTOP/TABLET: bottom-right near footer
        "sm:right-4 sm:bottom-12",
      ].join(" ")}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-neutral-900 text-neutral-200 border border-neutral-700 px-3 py-2 text-xs shadow hover:bg-neutral-800 active:scale-[0.99]"
          title="Open Tool Registry Panel"
        >
          Tools: {counts.allowed}/{counts.total}
        </button>
      ) : (
        <div
          className={[
            // Mobile clamp + Desktop width
            "w-[min(96vw,430px)] sm:w-[480px]",
            // Height clamp; inner scrolls
            "max-h-[min(85dvh,720px)] overflow-hidden",
            "rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl",
            // Subtle entrance
            "animate-in fade-in zoom-in-95",
          ].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label="Tool Registry"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/75">
            <div className="text-sm sm:text-base text-neutral-200 font-medium">Tool Registry</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => refresh("panel")}
                className="rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
              >
                Refresh
              </button>
              <button
                onClick={() => enablePolling(4000)}
                className="rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
              >
                Poll
              </button>
              <button
                onClick={disablePolling}
                className="rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
              >
                Stop
              </button>
              <button
                onClick={() => {
                  const next = !logsOn;
                  setLogsOn(next);
                  setVerboseLogging(next);
                }}
                className="rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
              >
                {logsOn ? "Logs On" : "Logs Off"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>
          </div>

          {/* Stats band */}
          <div className="px-3 py-2 text-[11px] sm:text-xs text-neutral-400 grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-neutral-800">
            <div className="space-y-0.5">
              <div>
                Loading:{" "}
                <span className={isLoading ? "text-amber-400" : "text-emerald-400"}>
                  {String(isLoading)}
                </span>
              </div>
              <div>Last: {stats.lastLoadedAt ? stats.lastLoadedAt.toLocaleTimeString() : "—"}</div>
              {stats.lastError ? (
              <div className="truncate text-red-400">Error: {stats.lastError}</div>
             ) : (
              <div className="truncate text-green-400">Tools Pass</div> 
             )}
            </div>
            <div className="space-y-0.5">
              <div>
                loads: {stats.loads} | updates: {stats.updates} | retries: {stats.retries}
              </div>
              <div>
                getter: {counts.getter} | realtime: {counts.realtime} | global: {counts.global}
              </div>
              <div className="truncate">reason: {stats.lastReason ?? "—"}</div>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="min-h-0 max-h-[60dvh] overflow-auto">
            {entries.length === 0 ? (
              <div className="px-3 py-6 text-neutral-500 text-sm text-center">
                No tools loaded.
              </div>
            ) : (
              entries.map((e) => {
                const isAllowed = allowed?.has(e.name);

                return (
                  <div key={e.name} className="border-b border-neutral-900/70">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      {/* LEFT: status dot + tool name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={[
                            "inline-block h-2 w-2 rounded-full shrink-0",
                            isAllowed ? "bg-emerald-400" : "bg-red-500/70",
                          ].join(" ")}
                          title={
                            isAllowed
                              ? "Allowed for this agent"
                              : "Not allowed for this agent"
                          }
                        />
                        <div className="text-neutral-200 text-sm font-medium truncate">
                          {e.name}
                        </div>
                      </div>

                      {/* RIGHT: actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() =>
                            setShowCode((p) => (p === e.name ? null : e.name))
                          }
                          className="rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
                        >
                          {showCode === e.name ? "Hide" : "View"}
                        </button>
                      </div>
                    </div>

                    {showCode === e.name && (
                      <div className="px-3 pb-3">
                        <pre className="block w-full max-h-[40dvh] overflow-auto rounded-md bg-neutral-950 border border-neutral-800 p-2 text-[12px] leading-relaxed text-neutral-300">
                          {safeToString(e.fn)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function safeToString(fn: Function): string {
  try {
    return fn.toString();
  } catch {
    return "// source unavailable";
  }
}
