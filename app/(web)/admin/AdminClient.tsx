"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type LivePayload = {
  now: string;
  view: "live";
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
    engaged: number;
    idle: number;
    stale: number;
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
    identityKey: string | null;
    emailHash: string | null;
    startedAt: string;
    lastSeenAt: string;
    active: boolean;
    ageSec: number;
    idleSec: number;
    status: "engaged" | "idle" | "stale";
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

type EndedPayload = {
  now: string;
  view: "ended";
  days: number;
  endedSessions: Array<{
    _id: string;
    smSessionId: string;
    tenantId: string | null;
    identityKind: "console" | "widget";
    startedAt: string;
    lastSeenAt: string;
    endedAt: string | null;
    endedReason: string | null;
    ageSec: number;
    idleSec: number;
  }>;
};

type MetricsPayload = LivePayload | EndedPayload;

function fmtMoney(x: number) {
  return `$${x.toFixed(2)}`;
}
function fmtInt(n: number) {
  return n.toLocaleString();
}

function StatusDot({ status }: { status: "engaged" | "idle" | "stale" }) {
  const cls =
    status === "engaged"
      ? "bg-emerald-400"
      : status === "idle"
      ? "bg-amber-400"
      : "bg-violet-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} title={status} />;
}

export default function AdminClient() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [streamOk, setStreamOk] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedTenant, setSelectedTenant] = useState<string>("(all)");
  const [view, setView] = useState<"live" | "ended">("live");
  const [endedDays, setEndedDays] = useState<7 | 30 | 90>(7);

  const refreshInFlight = useRef<Promise<void> | null>(null);
  const lastRefreshAt = useRef(0);

  const refreshThrottled = async (minIntervalMs = 1200) => {
    const now = Date.now();
    if (now - lastRefreshAt.current < minIntervalMs) return;
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

    const url =
      view === "live"
        ? "/api/admin/metrics"
        : `/api/admin/metrics?view=ended&days=${endedDays}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      setErr(`metrics failed: ${r.status}`);
      return;
    }
    const j = (await r.json()) as MetricsPayload;
    setData(j);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, endedDays]);

  // SSE stream: only meaningful for LIVE view
  useEffect(() => {
    if (view !== "live") return;

    let es: EventSource | null = null;
    let poll: any = null;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => refresh(), 4000);
    };

    try {
      es = new EventSource("/api/admin/stream");

      es.onopen = () => setStreamOk(true);
      es.addEventListener("hello", () => setStreamOk(true));
      es.addEventListener("ping", () => setStreamOk(true));

      const onAny = (e: any) => {
        refreshThrottled(1200);
      };

      es.addEventListener("realtime_sessions", onAny);
      es.addEventListener("usage_daily", onAny);
      es.addEventListener("ratelimits", onAny);

      es.onerror = () => {
        setStreamOk(false);
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      if (es) es.close();
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const live = data && data.view === "live" ? data : null;
  const ended = data && data.view === "ended" ? data : null;

  const tenants = live?.tenants || [];

  const activeSessions = useMemo(() => {
    const list = live?.activeSessions || [];
    if (selectedTenant === "(all)") return list;
    if (selectedTenant === "(none)") return list.filter((s) => !s.tenantId);
    return list.filter((s) => s.tenantId === selectedTenant);
  }, [live, selectedTenant]);

  const usageToday = live?.usageToday || [];

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

  const sweepStale = async (dryRun = false) => {
    await fetch("/api/admin/sessions/sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staleGraceSec: 3600,
        hardMaxAgeSec: 86400,
        dryRun,
      }),
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
            {view === "live" && (
              <span className="ml-3 inline-flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${streamOk ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span>{streamOk ? "Realtime" : "Polling"}</span>
              </span>
            )}
          </div>

          {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-zinc-800 overflow-hidden">
            <button
              onClick={() => setView("live")}
              className={`px-3 py-2 text-sm ${view === "live" ? "bg-zinc-800" : "bg-zinc-900 hover:bg-zinc-800"}`}
            >
              Live
            </button>
            <button
              onClick={() => setView("ended")}
              className={`px-3 py-2 text-sm ${view === "ended" ? "bg-zinc-800" : "bg-zinc-900 hover:bg-zinc-800"}`}
            >
              Ended
            </button>
          </div>

          {view === "ended" && (
            <select
              value={endedDays}
              onChange={(e) => setEndedDays(Number(e.target.value) as 7 | 30 | 90)}
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          )}

          <button onClick={refresh} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm">
            Refresh
          </button>

          {view === "live" && (
            <>
              <button
                onClick={() => sweepStale(false)}
                className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm"
                title="Marks stale active:true sessions as active:false"
              >
                Clean up stale
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
                    {t.tenantId} (engaged:{t.engaged})
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* LIVE VIEW */}
      {live && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <Card title="Active sessions (engaged)" value={live.overview.activeSessions ?? 0} />
            <Card title="Active tenants" value={live.overview.activeTenants ?? 0} />
            <Card title="Tokens today" value={fmtInt(live.overview.tokensToday ?? 0)} />
            <Card title="Spend today" value={fmtMoney(live.overview.dollarsToday ?? 0)} />
          </div>

          {/* Tenants + Sessions + Usage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
            {/* Tenants */}
            <div className="lg:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="font-medium">Tenants</div>
                <div className="text-xs text-zinc-400">Engaged / Max</div>
              </div>

              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-sm table-fixed">
                  <thead className="text-zinc-400">
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-2">Tenant</th>
                      <th className="text-right px-4 py-2">Conc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => {
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
                                  {t.kind} · engaged:{t.engaged} idle:{t.idle} stale:{t.stale}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2 text-right">
                            <div className="font-medium">
                              {t.engaged}/{t.maxConcurrent}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {(t.utilization * 100).toFixed(0)}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {tenants.length === 0 && (
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
                Using platform maxConcurrent: widget={live.cfg?.widgetLimits?.maxConcurrent ?? "?"} · console=
                {live.cfg?.consoleLimits?.maxConcurrent ?? "?"}
              </div>
            </div>

            {/* Sessions */}
            <div className="lg:col-span-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="font-medium">Live sessions</div>
                <div className="text-xs text-zinc-400">
                  Idle cutoff: {live.cfg?.maxSessionIdleSec ?? "?"}s · Stale: {live.cfg?.staleGraceSec ?? "?"}s
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm table-fixed">
                  <thead className="text-zinc-400">
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-2 w-[140px]">Tenant</th>
                      <th className="text-left px-4 py-2 w-[80px]">Kind</th>
                      <th className="text-left px-4 py-2 w-[70px]">Status</th>
                      <th className="text-left px-4 py-2">Session</th>
                      <th className="text-right px-4 py-2 w-[70px]">Age</th>
                      <th className="text-right px-4 py-2 w-[70px]">Idle</th>
                      <th className="text-right px-4 py-2 w-[70px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSessions.map((s) => (
                      <tr key={s._id} className="border-b border-zinc-800/60 hover:bg-zinc-900">
                        <td className="px-4 py-2 truncate" title={s.tenantId ?? ""}>
                          {s.tenantId || <span className="text-zinc-500">(none)</span>}
                        </td>
                        <td className="px-4 py-2">{s.identityKind}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <StatusDot status={s.status} />
                            <span className="text-xs text-zinc-300 capitalize">{s.status}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div
                            className="font-mono text-xs text-zinc-300 max-w-[220px] truncate"
                            title={s.smSessionId}
                          >
                            {s.smSessionId}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{Math.floor(s.ageSec / 60)}m</td>
                        <td className="px-4 py-2 text-right">{s.idleSec}s</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => endSession(s.smSessionId)}
                            className="rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-2 py-1 text-xs"
                            title="Marks active=false in Mongo (does not forcibly kill the browser WebRTC)"
                          >
                            End
                          </button>
                        </td>
                      </tr>
                    ))}

                    {activeSessions.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-zinc-500" colSpan={7}>
                          No sessions for this tenant filter.
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
                <table className="w-full text-sm table-fixed">
                  <thead className="text-zinc-400">
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-2">Doc</th>
                      <th className="text-right px-4 py-2 w-[80px]">Tokens</th>
                      <th className="text-right px-4 py-2 w-[70px]">$</th>
                      <th className="text-right px-4 py-2 w-[70px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageToday.slice(0, 50).map((u) => (
                      <tr key={u._id} className="border-b border-zinc-800/60 hover:bg-zinc-900">
                        <td className="px-4 py-2">
                          <div className="font-mono text-[11px] text-zinc-300 truncate" title={u._id}>
                            {u._id}
                          </div>
                        </td>
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

         {/* Rate summary */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 mt-6 p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Rate counters (last 15 minutes)</div>
              <div className="text-sm text-zinc-300">
                {live.overview.rateEventsLast15Min ?? 0} events
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
              <MiniStat label="ip:*" value={live.overview.rateBuckets.ip ?? 0} />
              <MiniStat label="user:*" value={live.overview.rateBuckets.user ?? 0} />
              <MiniStat label="sess:*" value={live.overview.rateBuckets.sess ?? 0} />
              <MiniStat label="other" value={live.overview.rateBuckets.other ?? 0} />
            </div>

            {/* Top IPs dropdown */}
            <div className="mt-4 flex flex-col gap-2">
              <div className="text-sm font-medium text-zinc-200">Top IPs (last 15 minutes)</div>
              <TopIpDropdown ips={(live.overview as any)?.topIps || []} />
            </div>
          </div>

        </>
      )}

      {/* ENDED VIEW */}
      {ended && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 mt-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="font-medium">Ended sessions (last {ended.days} days)</div>
            <div className="text-xs text-zinc-400">{ended.endedSessions.length} rows</div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2 w-[160px]">Tenant</th>
                  <th className="text-left px-4 py-2 w-[90px]">Kind</th>
                  <th className="text-left px-4 py-2">Session</th>
                  <th className="text-left px-4 py-2 w-[140px]">Ended</th>
                  <th className="text-left px-4 py-2 w-[140px]">Reason</th>
                  <th className="text-right px-4 py-2 w-[80px]">Age</th>
                  <th className="text-right px-4 py-2 w-[80px]">Idle</th>
                </tr>
              </thead>
              <tbody>
                {ended.endedSessions.map((s) => (
                  <tr key={s._id} className="border-b border-zinc-800/60 hover:bg-zinc-900">
                    <td className="px-4 py-2 truncate">{s.tenantId || "(none)"}</td>
                    <td className="px-4 py-2">{s.identityKind}</td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs text-zinc-300 truncate" title={s.smSessionId}>
                        {s.smSessionId}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-300">
                      {s.endedAt ? new Date(s.endedAt).toLocaleString() : "(unknown)"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-300">{s.endedReason || "(none)"}</td>
                    <td className="px-4 py-2 text-right">{Math.floor(s.ageSec / 60)}m</td>
                    <td className="px-4 py-2 text-right">{s.idleSec}s</td>
                  </tr>
                ))}

                {ended.endedSessions.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-zinc-500" colSpan={7}>
                      No ended sessions in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

function TopIpDropdown({
  ips,
}: {
  ips: Array<{
    ip: string;
    hits: number;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    asn?: number | null;
    asOrg?: string | null;
  }>;
}) {
  const [selected, setSelected] = useState<string>(ips?.[0]?.ip || "");

  useEffect(() => {
    if (!selected && ips?.[0]?.ip) setSelected(ips[0].ip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ips?.length]);

  const rec = ips.find((x) => x.ip === selected) || null;
  const label =
    rec
      ? [rec.city, rec.region, rec.country].filter(Boolean).join(", ")
      : "";

  const copy = async () => {
    if (!rec?.ip) return;
    try {
      await navigator.clipboard.writeText(rec.ip);
    } catch {}
  };

  if (!ips || ips.length === 0) {
    return (
      <div className="text-sm text-zinc-500">
        No IP counters yet. (They appear when IP tracking is enabled and traffic hits /api/session.)
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
      >
        {ips.map((x) => {
          const loc = [x.city, x.region, x.country].filter(Boolean).join(", ");
          const org = x.asOrg ? ` · ${x.asOrg}` : "";
          return (
            <option key={x.ip} value={x.ip}>
              {x.ip} · {x.hits} hits{loc ? ` · ${loc}` : ""}{org}
            </option>
          );
        })}
      </select>

      <button
        onClick={copy}
        className="rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 text-sm"
        title="Copy IP"
      >
        Copy
      </button>

      {rec && (
        <div className="hidden lg:block text-xs text-zinc-500 ml-2 truncate max-w-[360px]" title={label}>
          {label || "No geo data"}
          {rec.asn ? ` · AS${rec.asn}` : ""}
        </div>
      )}
    </div>
  );
}

