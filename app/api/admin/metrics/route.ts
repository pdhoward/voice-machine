import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { rateCfg } from "@/config/rate";
import { requireAdmin } from "@/app/api/_lib/adminAuth";

type RealtimeSessionDoc = {
  _id: string;
  identityKind: "console" | "widget";
  identityKey?: string;
  emailHash?: string | null;
  tenantId?: string | null;
  smSessionId: string;
  startedAt: Date;
  lastSeenAt: Date;
  active: boolean;
  endedAt?: Date;
  endedReason?: string;
};

type DailyUsageDoc = {
  _id: string;
  emailHash?: string;
  date: string;
  tokens: number;
  dollars: number;
  createdAt: Date;
  updatedAt: Date;
};

type RateDoc = {
  _id: string;
  count: number;
  windowSec: number;
  createdAt: Date;
};

function isoDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function clampDays(n: number) {
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "live"; // live | ended
  const days = clampDays(Number(url.searchParams.get("days") || "7"));

  const { db } = await getMongoConnection(process.env.DB!, process.env.MAINDBNAME!);

  const sessionsColl = db.collection<RealtimeSessionDoc>("realtime_sessions");
  const usageColl = db.collection<DailyUsageDoc>("usage_daily");
  const rateColl = db.collection<RateDoc>("ratelimits");

  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  // ---- ended view ----
  if (view === "ended") {
    const since = new Date(nowMs - days * 24 * 60 * 60 * 1000);

    const ended = await sessionsColl
      .find({
        active: false,
        endedAt: { $gte: since },
      })
      .sort({ endedAt: -1 })
      .limit(2000)
      .toArray();

    const endedSessions = ended.map((s) => {
      const ageSec = Math.floor((nowMs - new Date(s.startedAt).getTime()) / 1000);
      const idleSec = Math.floor((nowMs - new Date(s.lastSeenAt).getTime()) / 1000);
      return {
        _id: s._id,
        smSessionId: s.smSessionId,
        tenantId: s.tenantId || null,
        identityKind: s.identityKind,
        startedAt: s.startedAt,
        lastSeenAt: s.lastSeenAt,
        endedAt: s.endedAt || null,
        endedReason: s.endedReason || null,
        ageSec,
        idleSec,
      };
    });

    return NextResponse.json({
      now: nowIso,
      view: "ended",
      days,
      endedSessions,
    });
  }

  // ---- live view ----
  const staleGraceSec = 60 * 60; // 1 hour (tune)
  const maxIdleSec = rateCfg.maxSessionIdleSec;

  const activeDocs = await sessionsColl
    .find({ active: true })
    .sort({ lastSeenAt: -1 })
    .limit(1000)
    .toArray();

  const activeSessions = activeDocs.map((s) => {
    const ageSec = Math.floor((nowMs - new Date(s.startedAt).getTime()) / 1000);
    const idleSec = Math.floor((nowMs - new Date(s.lastSeenAt).getTime()) / 1000);

    const isStale = idleSec > staleGraceSec;
    const isIdle = idleSec > maxIdleSec;

    const status: "engaged" | "idle" | "stale" = isStale ? "stale" : isIdle ? "idle" : "engaged";

    return {
      _id: s._id,
      smSessionId: s.smSessionId,
      tenantId: s.tenantId || null,
      identityKind: s.identityKind,
      identityKey: s.identityKey || null,
      emailHash: (s.emailHash as any) || null,
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      active: s.active,
      ageSec,
      idleSec,
      status,
    };
  });

  // tenant aggregation: based on computed status
  const tenantAgg = new Map<
    string,
    {
      tenantId: string;
      engaged: number;
      idle: number;
      stale: number;
      widget: number;
      console: number;
    }
  >();

  for (const s of activeSessions) {
    const tenantId = s.tenantId || "(none)";
    const rec =
      tenantAgg.get(tenantId) || {
        tenantId,
        engaged: 0,
        idle: 0,
        stale: 0,
        widget: 0,
        console: 0,
      };

    if (s.status === "engaged") rec.engaged += 1;
    else if (s.status === "idle") rec.idle += 1;
    else rec.stale += 1;

    if (s.identityKind === "widget") rec.widget += 1;
    else rec.console += 1;

    tenantAgg.set(tenantId, rec);
  }

  const tenants = Array.from(tenantAgg.values())
    .map((t) => {
      const maxConcurrent =
        t.tenantId === "(none)"
          ? rateCfg.consoleLimits.maxConcurrent
          : rateCfg.widgetLimits.maxConcurrent;

      const kind =
        t.widget > 0 && t.console === 0
          ? "widget"
          : t.console > 0 && t.widget === 0
          ? "console"
          : "mixed";

      const utilization = maxConcurrent > 0 ? t.engaged / maxConcurrent : 0;

      return {
        tenantId: t.tenantId,
        engaged: t.engaged,
        idle: t.idle,
        stale: t.stale,
        widget: t.widget,
        console: t.console,
        kind,
        maxConcurrent,
        utilization,
        status:
          maxConcurrent > 0 && t.engaged > maxConcurrent
            ? "over"
            : maxConcurrent > 0 && utilization >= 0.8
            ? "near"
            : "ok",
      };
    })
    .sort((a, b) => b.engaged - a.engaged);

  // usage today
  const today = isoDay();
  const usageTodayDocs = await usageColl
    .find({ date: today })
    .sort({ dollars: -1 })
    .limit(5000)
    .toArray();

  const dollarsToday = usageTodayDocs.reduce((a, d) => a + (d.dollars || 0), 0);
  const tokensToday = usageTodayDocs.reduce((a, d) => a + (d.tokens || 0), 0);

  // ratelimits last 15 mins
  const since15 = new Date(nowMs - 15 * 60 * 1000);
  const rateRecent = await rateColl
    .find({ createdAt: { $gte: since15 } })
    .sort({ createdAt: -1 })
    .limit(2000)
    .toArray();

  const rateBuckets = { ip: 0, user: 0, sess: 0, other: 0 };
  for (const r of rateRecent) {
    const c = r.count || 0;
    if (r._id.startsWith("ip:")) rateBuckets.ip += c;
    else if (r._id.startsWith("user:")) rateBuckets.user += c;
    else if (r._id.startsWith("sess:")) rateBuckets.sess += c;
    else rateBuckets.other += c;
  }

  const engagedSessionsCount = activeSessions.filter((s) => s.status === "engaged").length;
  const engagedTenantsCount = tenants.filter((t) => t.tenantId !== "(none)" && t.engaged > 0).length;

  return NextResponse.json({
    now: nowIso,
    view: "live",
    cfg: {
      maxSessionMinutes: rateCfg.maxSessionMinutes,
      maxSessionIdleSec: rateCfg.maxSessionIdleSec,
      staleGraceSec,
      widgetLimits: rateCfg.widgetLimits,
      consoleLimits: rateCfg.consoleLimits,
    },
    overview: {
      activeSessions: engagedSessionsCount,
      activeTenants: engagedTenantsCount,
      tokensToday,
      dollarsToday,
      rateEventsLast15Min: rateRecent.length,
      rateBuckets,
    },
    tenants,
    activeSessions,
    usageToday: usageTodayDocs.map((u) => ({
      _id: u._id,
      date: u.date,
      emailHash: u.emailHash || null,
      tokens: u.tokens || 0,
      dollars: u.dollars || 0,
      updatedAt: u.updatedAt,
    })),
  });
}
