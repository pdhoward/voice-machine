import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { rateCfg } from "@/config/rate";
import { requireAdmin } from "@/app/api/_lib/adminAuth";

type RealtimeSessionDoc = {
  _id: string;
  identityKind: "console" | "widget";
  identityKey: string;
  emailHash?: string;
  tenantId?: string;
  smSessionId: string;
  startedAt: Date;
  lastSeenAt: Date;
  active: boolean;
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

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const { db } = await getMongoConnection(process.env.DB!, process.env.MAINDBNAME!);

  const sessionsColl = db.collection<RealtimeSessionDoc>("realtime_sessions");
  const usageColl = db.collection<DailyUsageDoc>("usage_daily");

  // IMPORTANT: your enforcement code uses "ratelimits"
  const rateColl = db.collection<RateDoc>("ratelimits");

  const now = Date.now();
  const idleMs = rateCfg.maxSessionIdleSec * 1000;
  const maxDurMs = rateCfg.maxSessionMinutes * 60 * 1000;

  const activeSince = new Date(now - idleMs);
  const startedAfter = new Date(now - maxDurMs);

  // Active sessions: "active:true" + lastSeen within idle window + started within max duration
  const activeSessions = await sessionsColl
    .find({
      active: true,
      lastSeenAt: { $gte: activeSince },
      startedAt: { $gte: startedAfter },
    })
    .sort({ lastSeenAt: -1 })
    .limit(500)
    .toArray();

 const tenantAgg = new Map<
    string,
    { tenantId: string; active: number; widget: number; console: number }
  >();

  for (const s of activeSessions) {
    const tenantId = s.tenantId || "(none)";
    const rec = tenantAgg.get(tenantId) || { tenantId, active: 0, widget: 0, console: 0 };
    rec.active += 1;
    if (s.identityKind === "widget") rec.widget += 1;
    else rec.console += 1;
    tenantAgg.set(tenantId, rec);
  }

  // Today's usage docs
  const today = isoDay();
  const usageToday = await usageColl
    .find({ date: today })
    .sort({ dollars: -1 })
    .limit(5000)
    .toArray();

  // Last 15 minutes ratelimits
  const since15 = new Date(now - 15 * 60 * 1000);
  const rateRecent = await rateColl
    .find({ createdAt: { $gte: since15 } })
    .sort({ createdAt: -1 })
    .limit(2000)
    .toArray();

  // Light aggregation for the UI
  const dollarsToday = usageToday.reduce((a, d) => a + (d.dollars || 0), 0);
  const tokensToday = usageToday.reduce((a, d) => a + (d.tokens || 0), 0);

  // bucket rate docs by type using _id prefixes (ip:, user:, sess:)
  const rateBuckets = { ip: 0, user: 0, sess: 0, other: 0 };
  for (const r of rateRecent) {
    if (r._id.startsWith("ip:")) rateBuckets.ip += 1;
    else if (r._id.startsWith("user:")) rateBuckets.user += 1;
    else if (r._id.startsWith("sess:")) rateBuckets.sess += 1;
    else rateBuckets.other += 1;
  }

  const tenants = Array.from(tenantAgg.values())
    .map((t) => {
      // If tenantId is "(none)", treat as console-ish, but you can decide
      const maxConcurrent =
        t.tenantId === "(none)"
          ? rateCfg.consoleLimits.maxConcurrent
          : rateCfg.widgetLimits.maxConcurrent;

      // Choose "kind" based on where sessions are coming from
      const kind =
        t.widget > 0 && t.console === 0
          ? "widget"
          : t.console > 0 && t.widget === 0
          ? "console"
          : "mixed";

      const utilization = maxConcurrent > 0 ? t.active / maxConcurrent : 0;

      return {
        tenantId: t.tenantId,
        active: t.active,
        widget: t.widget,
        console: t.console,
        kind,
        maxConcurrent,
        utilization, // 0..N
        status:
          maxConcurrent > 0 && t.active > maxConcurrent
            ? "over"
            : maxConcurrent > 0 && utilization >= 0.8
            ? "near"
            : "ok",
      };
    })
    .sort((a, b) => b.active - a.active);

  return NextResponse.json({
    now: new Date().toISOString(),
    cfg: {
      maxSessionMinutes: rateCfg.maxSessionMinutes,
      maxSessionIdleSec: rateCfg.maxSessionIdleSec,
      widgetLimits: rateCfg.widgetLimits,
      consoleLimits: rateCfg.consoleLimits,
    },
    overview: {
      activeSessions: activeSessions.length,
      activeTenants: tenants.filter((t) => t.tenantId !== "(none)").length,
      tokensToday,
      dollarsToday,
      rateEventsLast15Min: rateRecent.length,
      rateBuckets,
    },
    tenants,
    activeSessions: activeSessions.map((s) => ({
      _id: s._id,
      smSessionId: s.smSessionId,
      tenantId: s.tenantId || null,
      identityKind: s.identityKind,
      identityKey: s.identityKey,
      emailHash: s.emailHash || null,
      startedAt: s.startedAt,
      lastSeenAt: s.lastSeenAt,
      active: s.active,
      // derived durations (UI convenience)
      ageSec: Math.floor((now - new Date(s.startedAt).getTime()) / 1000),
      idleSec: Math.floor((now - new Date(s.lastSeenAt).getTime()) / 1000),
    })),
    usageToday: usageToday.map((u) => ({
      _id: u._id,
      date: u.date,
      emailHash: u.emailHash || null,
      tokens: u.tokens || 0,
      dollars: u.dollars || 0,
      updatedAt: u.updatedAt,
    })),
  });
}
