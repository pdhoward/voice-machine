"use client";

import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import TriggerIconButton from "./TriggerIconButton";
import { Captions, Download } from "lucide-react";

type ConvItem = { id: string; role: string; text?: string; timestamp: number };

type Props = {
  conversation: ConvItem[];
  onDownload: () => void;
  active?: boolean;
};

export default function TranscriptDialogTrigger({
  conversation,
  onDownload,
  active = true,
}: Props) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = Array.isArray(conversation) ? conversation : [];
    const query = q.trim().toLowerCase();
    if (!query) return list.slice(-200);
    return list
      .filter((m) => {
        const text = (m.text || "").toLowerCase();
        const role = (m.role || "").toLowerCase();
        return text.includes(query) || role.includes(query);
      })
      .slice(-200);
  }, [conversation, q]);

  const iconClass = active ? "text-emerald-500" : "text-neutral-500";

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* ✅ Tooltip requested */}
        <TriggerIconButton title="View transcript">
          <Captions size={14} className={iconClass} />
        </TriggerIconButton>
      </DialogTrigger>

      <DialogContent className="bg-neutral-900 text-neutral-200 border border-neutral-800 max-w-[90vw] max-h-[80vh] w-[420px] h-[440px] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">Transcript</DialogTitle>

            {/* ✅ Tooltip requested */}
            <button
              type="button"
              onClick={onDownload}
              className={[
                "inline-flex items-center justify-center",
                "h-7 w-7 rounded-full",
                "bg-white/10 hover:bg-white/15",
                "text-white/90",
                "border border-white/10",
                "transition",
              ].join(" ")}
              title="Download transcript"
              aria-label="Download transcript"
            >
              <Download size={14} />
            </button>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search transcript…"
            className="w-full p-2 bg-neutral-800/80 text-neutral-200 text-xs rounded-lg border border-neutral-700/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>

        <div className="flex-1 overflow-y-auto text-xs text-neutral-300 mt-3">
          {rows.length > 0 ? (
            rows.map((m) => (
              <div
                key={m.id}
                className="border-b border-neutral-800/80 py-2 leading-snug"
              >
                <span className="text-neutral-500 mr-1">
                  {new Date(m.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={
                    m.role === "user"
                      ? "text-emerald-400"
                      : m.role === "assistant"
                      ? "text-cyan-300"
                      : "text-neutral-400"
                  }
                >
                  {m.role}:
                </span>{" "}
                <span className="text-neutral-200">{m.text || "…"}</span>
              </div>
            ))
          ) : (
            <p className="text-neutral-500">No matching transcript.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

