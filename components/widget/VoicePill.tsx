// components/widget/VoicePill.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MicIcon, MicOff, Play, PhoneOff, ChevronUp, ChevronDown } from "lucide-react";

export type VoicePillProps = {
  displayName: string;
  status: string;
  isConnected: boolean;
  volume: number;

  onStart: () => void;
  onEnd: () => void;

  expanded?: boolean;
  onToggleExpanded?: () => void;

  micEnabled: boolean;
  onToggleMic: () => void;
};

function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useSmoothedLevel(raw: number, enabled: boolean) {
  const [level, setLevel] = useState(0);
  const raf = useRef<number | null>(null);
  const target = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    target.current = enabled ? raw : 0;
  }, [raw, enabled]);

  useEffect(() => {
    const tick = () => {
      const mapped = clamp((target.current * 350) / 18); // keep your scale feel

      const attack = 0.25;
      const release = 0.08;

      const diff = mapped - current.current;
      const k = diff > 0 ? attack : release;

      current.current = current.current + diff * k;
      setLevel(current.current);

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return level;
}

function CapsuleMeter({ level, active }: { level: number; active: boolean }) {
  const w = active ? (12 + level * 88) : 14;

  return (
    <div className="relative h-3 w-20 overflow-hidden rounded-full bg-white/15">
      <motion.div
        className="absolute left-0 top-0 h-full rounded-full bg-white/85"
        animate={{ width: `${w}%` }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/12 to-transparent" />
    </div>
  );
}

export default function VoicePill({
  displayName,
  status,
  isConnected,
  volume,
  onStart,
  onEnd,
  expanded,
  onToggleExpanded,
  micEnabled,
  onToggleMic,
}: VoicePillProps) {
  const isBusy = status === "CONNECTING";

  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!isConnected) {
      setSeconds(0);
      return;
    }
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [isConnected]);

  const level = useSmoothedLevel(volume, isConnected);

  const [showTime, setShowTime] = useState(false);
  const timeTimeout = useRef<number | null>(null);
  const pulseTime = () => {
    setShowTime(true);
    if (timeTimeout.current) window.clearTimeout(timeTimeout.current);
    timeTimeout.current = window.setTimeout(() => setShowTime(false), 2500);
  };

  useEffect(() => {
    return () => {
      if (timeTimeout.current) window.clearTimeout(timeTimeout.current);
    };
  }, []);

  const pillBg = useMemo(() => {
    if (isConnected) return "bg-violet-600";
    return "bg-neutral-900";
  }, [isConnected]);

  const statusText = isBusy ? "Connecting…" : isConnected ? "Live" : "Start";

  const primary = () => {
    if (isBusy) return;
    if (!isConnected) onStart();
    else onEnd();
  };

  const micTitle = micEnabled ? "Mic on (click to mute)" : "Mic off (click to unmute)";

  return (
    <motion.div
      className={[
        "w-full",
        "rounded-full shadow-lg ring-1 ring-white/10",
        pillBg,
      ].join(" ")}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        onClick={() => pulseTime()}
        onMouseEnter={() => setShowTime(true)}
        onMouseLeave={() => setShowTime(false)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-label="Voice controls"
      >
        {/* ✅ Mic toggle */}
        <span
          className={[
            "relative grid h-7 w-7 place-items-center rounded-full",
            micEnabled ? "bg-white/12" : "bg-black/25",
            "ring-1",
            micEnabled ? "ring-white/20" : "ring-white/10",
            "cursor-pointer select-none",
          ].join(" ")}
          title={micTitle}
          role="button"
          aria-label={micTitle}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleMic();
          }}
        >
          {/* pulsing ring when mic is ON */}
          <AnimatePresence>
            {micEnabled && (
              <motion.span
                key="micpulse"
                className="absolute inset-0 rounded-full ring-2 ring-white/30"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0.15, 0.45, 0.15], scale: [1, 1.18, 1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </AnimatePresence>

          {micEnabled ? (
            <MicIcon className="h-4 w-4 text-white" />
          ) : (
            <MicOff className="h-4 w-4 text-white/70" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <CapsuleMeter level={level} active={isConnected} />
            <span className="text-sm font-semibold text-white/95">{statusText}</span>
            <span className="min-w-0 truncate text-xs text-white/70">{displayName}</span>

            {/* ✅ optional inline hint */}
            <span className="ml-1 text-[10px] text-white/60">
              {micEnabled ? "" : "Muted"}
            </span>
          </div>

          <div
            className={[
              "mt-1 text-xs text-white/75 transition-opacity duration-200",
              showTime && isConnected ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {formatTime(seconds)}
          </div>
        </div>

        {/* primary start/end button unchanged */}
        <span
          className={[
            "grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-sm",
            isBusy ? "opacity-60" : "opacity-100",
          ].join(" ")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            primary();
          }}
          role="button"
          title={isConnected ? "End call" : "Start voice"}
          aria-label={isConnected ? "End call" : "Start voice"}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isConnected ? (
              <motion.span
                key="end"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                className="text-red-600"
              >
                <PhoneOff className="h-4 w-4" />
              </motion.span>
            ) : (
              <motion.span
                key="start"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                className="text-sky-600"
              >
                <Play className="h-4 w-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {onToggleExpanded && (
          <span
            className="ml-1 text-white/80"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleExpanded();
            }}
            role="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </span>
        )}
      </button>
    </motion.div>
  );
}
