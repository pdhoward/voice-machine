import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { requireAdmin } from "@/app/api/_lib/adminAuth";
import type { Filter } from "mongodb";

type RealtimeSessionDoc = {
  _id: string;
  active: boolean;
  startedAt: Date;
  lastSeenAt: Date;
  endedAt?: Date;
  endedReason?: string;
};

function clampInt(v: any, dflt: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * POST /api/admin/sessions/sweep
 * Body (optional):
 *  - staleGraceSec: seconds since lastSeenAt to consider stale (default 3600)
 *  - hardMaxAgeSec: seconds since startedAt to force close (default 86400)
 *  - dryRun: boolean (default false) -> only counts, no updates
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({} as any));

  const staleGraceSec = clampInt(body?.staleGraceSec, 3600, 60, 7 * 24 * 3600); // 1h
  const hardMaxAgeSec = clampInt(body?.hardMaxAgeSec, 24 * 3600, 5 * 60, 30 * 24 * 3600); // 24h
  const dryRun = Boolean(body?.dryRun);

  const now = Date.now();
  const staleBefore = new Date(now - staleGraceSec * 1000);
  const ageBefore = new Date(now - hardMaxAgeSec * 1000);

  const { db } = await getMongoConnection(process.env.DB!, process.env.MAINDBNAME!);
  const sessions = db.collection<RealtimeSessionDoc>("realtime_sessions");

  const filter: Filter<RealtimeSessionDoc> = {
    active: true,
    $or: [
      { lastSeenAt: { $lt: staleBefore } },
      { startedAt: { $lt: ageBefore } },
    ],
  };

  const matchCount = await sessions.countDocuments(filter);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      matchCount,
      staleGraceSec,
      hardMaxAgeSec,
      staleBefore,
      ageBefore,
    });
  }

  const res = await sessions.updateMany(filter, {
    $set: {
      active: false,
      endedAt: new Date(),
      endedReason: "STALE_SWEEP",
    },
  });

  return NextResponse.json({
    ok: true,
    dryRun: false,
    staleGraceSec,
    hardMaxAgeSec,
    matched: res.matchedCount,
    modified: res.modifiedCount,
    matchCount,
  });
}
