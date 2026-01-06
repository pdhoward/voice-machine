"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";

type MetricsPayload = {
  now: string;
  cfg: any;
  overview: {
    activeSessions: number;
    activeTenants: number;
    tokensToday: number;
    dollarsToday: number;
    rateEventsLast15Min: number;
    rateBuckets: { ip: number; user: number; sess: number; other: number };
  };
  tenants: Array<{
      tenantId: string;
      active: number;
      widget: number;
      console: number;
      kind: "widget" | "console" | "mixed";
      maxConcurrent: number;
      utilization: number;
      status: "ok" | "near" | "over";
    }>;
  activeSessions: Array<{
    _id: string;
    smSessionId: string;
    tenantId: string | null;
    identityKind: "console" | "widget";
    identityKey: string;
    emailHash: string | null;
    startedAt: string;
    lastSeenAt: string;
    active: boolean;
    ageSec: number;
    idleSec: number;
  }>;
  usageToday: Array<{
    _id: string;
    date: string;
    emailHash: string | null;
    tokens: number;
    dollars: number;
    updatedAt: string;
  }>;
};

function fmtMoney(x: number) {
  return `$${x.toFixed(2)}`;
}
function fmtInt(n: number) {
  return n.toLocaleString();
}

export default function AdminClient() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [streamOk, setStreamOk] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>("(all)");

  const refreshInFlight = useRef<Promise<void> | null>(null);
  const lastRefreshAt = useRef(0);

  const refreshThrottled = async (minIntervalMs = 1200) => {
    const now = Date.now();
    if (now - lastRefreshAt.current < minIntervalMs) return;

    // If a refresh is already running, don't start another.
    if (refreshInFlight.current) return;

    lastRefreshAt.current = now;
    refreshInFlight.current = (async () => {
      try {
        await refresh();
      } finally {
        refreshInFlight.current = null;
      }
    })();
  };


  const refresh = async () => {
    setErr(null);
    const r = await fetch("/api/admin/metrics", { cache: "no-store" });
    if (!r.ok) {
      setErr(`metrics failed: ${r.status}`);
      return;
    }
    const j = (await r.json()) as MetricsPayload;
    setData(j);
  };

  useEffect(() => {
    refresh();
  }, []);

  // SSE stream (falls back to polling if error)
  useEffect(() => {

    console.log("[Admin] mounting SSE effect");
    let es: EventSource | null = null;
    let poll: any = null;

    const startPolling = () => {
      if (poll) return;
      console.warn("[Admin] SSE unavailable, starting polling");
      poll = setInterval(() => refresh(), 3000);
    };
    
    const url = "/api/admin/stream";
    console.log("[Admin] opening EventSource:", url);

    try {
      es = new EventSource(url);

      es.onopen = () => {
        console.log("[Admin] SSE open");
        setStreamOk(true);
      };

      es.addEventListener("hello", (e) => {
        console.log("[Admin] SSE hello", (e as MessageEvent).data);
        setStreamOk(true);
      });

      es.addEventListener("ping", () => setStreamOk(true));

      // On any change, just re-fetch snapshot 
      const onAny = (e: any) => {
        console.log("[Admin] SSE event:", e?.type);
        refreshThrottled(1200); // at most ~1 refresh/sec
      };


      es.addEventListener("realtime_sessions", onAny);
      es.addEventListener("usage_daily", onAny);
      es.addEventListener("ratelimits", onAny);

      es.onerror = (e) => {
        console.warn("[Admin] SSE error", e);
        setStreamOk(false);
        startPolling();
      };

    } catch (e: any) {
      console.error("[Admin] SSE constructor failed", e);
      startPolling();
    }

    return () => {
      console.log("[Admin] cleaning up SSE");
      if (es) es.close();
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tenants = data?.tenants || [];
  const activeSessions = useMemo(() => {
    const list = data?.activeSessions || [];
    if (selectedTenant === "(all)") return list;
    if (selectedTenant === "(none)") return list.filter((s) => !s.tenantId);
    return list.filter((s) => s.tenantId === selectedTenant);
  }, [data, selectedTenant]);

  const usageToday = useMemo(() => {
    const list = data?.usageToday || [];
    return list;
  }, [data]);

  const endSession = async (smSessionId: string) => {
    await fetch("/api/admin/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smSessionId }),
    });
    refresh();
  };

  const resetUsage = async (id: string) => {
    await fetch("/api/admin/usage/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refresh();
  };

return (
  <div className="max-w-7xl mx-auto px-6 py-8">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Voice Agent Ops</h1>
        <div className="text-sm text-zinc-400 mt-1">
          {data?.now ? `Updated ${new Date(data.now).toLocaleString()}` : "Loading..."}
          <span className="ml-3 inline-flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                streamOk ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span>{streamOk ? "Realtime" : "Polling"}</span>
          </span>
        </div>
        {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={refresh}
          className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm"
        >
          Refresh
        </button>

        <select
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
        >
          <option value="(all)">(all tenants)</option>
          <option value="(none)">(no tenantId)</option>
          {tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              {t.tenantId} ({t.active})
            </option>
          ))}
        </select>
      </div>
    </div>

    {/* Overview cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      <Card title="Active sessions" value={data?.overview.activeSessions ?? 0} />
      <Card title="Active tenants" value={data?.overview.activeTenants ?? 0} />
      <Card title="Tokens today" value={fmtInt(data?.overview.tokensToday ?? 0)} />
      <Card title="Spend today" value={fmtMoney(data?.overview.dollarsToday ?? 0)} />
    </div>

    {/* NEW GRID WRAPPER (Tenants + Sessions + Usage) */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
      {/* Tenants */}
      <div className="lg:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="font-medium">Tenants</div>
          <div className="text-xs text-zinc-400">Active / Max</div>
        </div>

        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2">Tenant</th>
                <th className="text-right px-4 py-2">Conc</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tenants || []).map((t) => {
                const isSelected = selectedTenant === t.tenantId;

                const rowTone =
                  t.status === "over"
                    ? "bg-red-500/10 hover:bg-red-500/15"
                    : t.status === "near"
                    ? "bg-amber-500/10 hover:bg-amber-500/15"
                    : "hover:bg-zinc-900";

                return (
                  <tr
                    key={t.tenantId}
                    className={`border-b border-zinc-800/60 cursor-pointer ${rowTone} ${
                      isSelected ? "outline outline-1 outline-zinc-600" : ""
                    }`}
                    onClick={() =>
                      setSelectedTenant((prev) => (prev === t.tenantId ? "(all)" : t.tenantId))
                    }
                    title="Click to filter sessions"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            t.status === "over"
                              ? "bg-red-400"
                              : t.status === "near"
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <div className="truncate">
                          <div className="text-zinc-100">{t.tenantId}</div>
                          <div className="text-xs text-zinc-500">
                            {t.kind} · w:{t.widget} c:{t.console}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-2 text-right">
                      <div className="font-medium">
                        {t.active}/{t.maxConcurrent}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {(t.utilization * 100).toFixed(0)}%
                      </div>
                    </td>
                  </tr>
                );
              })}

              {(data?.tenants || []).length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-zinc-500" colSpan={2}>
                    No active tenants.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-800">
          Using platform maxConcurrent: widget={data?.cfg?.widgetLimits?.maxConcurrent ?? "?"} ·
          console={data?.cfg?.consoleLimits?.maxConcurrent ?? "?"}
        </div>
      </div>

      {/* Sessions */}
      <div className="lg:col-span-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="font-medium">Live sessions</div>
          <div className="text-xs text-zinc-400">
            Idle cutoff: {data?.cfg?.maxSessionIdleSec ?? "?"}s · Max duration:{" "}
            {data?.cfg?.maxSessionMinutes ?? "?"}m
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2">Tenant</th>
                <th className="text-left px-4 py-2">Kind</th>
                <th className="text-left px-4 py-2">Session</th>
                <th className="text-right px-4 py-2">Age</th>
                <th className="text-right px-4 py-2">Idle</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeSessions.map((s) => (
                <tr key={s._id} className="border-b border-zinc-800/60 hover:bg-zinc-900">
                  <td className="px-4 py-2">
                    {s.tenantId || <span className="text-zinc-500">(none)</span>}
                  </td>
                  <td className="px-4 py-2">{s.identityKind}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.smSessionId}</td>
                  <td className="px-4 py-2 text-right">{Math.floor(s.ageSec / 60)}m</td>
                  <td className="px-4 py-2 text-right">{s.idleSec}s</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => endSession(s.smSessionId)}
                      className="rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-2 py-1 text-xs"
                    >
                      End
                    </button>
                  </td>
                </tr>
              ))}

              {activeSessions.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-zinc-500" colSpan={6}>
                    No active sessions in the current window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage */}
      <div className="lg:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="font-medium">Usage today</div>
          <div className="text-xs text-zinc-400 mt-1">Reset works on today’s usage doc by _id.</div>
        </div>

        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2">Doc</th>
                <th className="text-right px-4 py-2">Tokens</th>
                <th className="text-right px-4 py-2">$</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usageToday.slice(0, 50).map((u) => (
                <tr key={u._id} className="border-b border-zinc-800/60 hover:bg-zinc-900">
                  <td className="px-4 py-2 font-mono text-[11px] text-zinc-300">{u._id}</td>
                  <td className="px-4 py-2 text-right">{fmtInt(u.tokens)}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(u.dollars)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => resetUsage(u._id)}
                      className="rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2 py-1 text-xs"
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              ))}

              {usageToday.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-zinc-500" colSpan={4}>
                    No usage docs for today yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {usageToday.length > 50 && (
            <div className="px-4 py-3 text-xs text-zinc-500">Showing top 50 by dollars.</div>
          )}
        </div>
      </div>
    </div>

    {/* Rate event summary */}
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 mt-6 p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Rate counters (last 15 minutes)</div>
        <div className="text-sm text-zinc-300">{data?.overview.rateEventsLast15Min ?? 0} events</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
        <MiniStat label="ip:*" value={data?.overview.rateBuckets.ip ?? 0} />
        <MiniStat label="user:*" value={data?.overview.rateBuckets.user ?? 0} />
        <MiniStat label="sess:*" value={data?.overview.rateBuckets.sess ?? 0} />
        <MiniStat label="other" value={data?.overview.rateBuckets.other ?? 0} />
      </div>
    </div>
  </div>
);

}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-sm text-zinc-400">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
