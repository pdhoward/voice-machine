import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { requireAdmin } from "@/app/api/_lib/adminAuth";

function isoDay() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resets today's usage doc.
 * Provide either:
 *  - key: "tenant:<tenantId>" (matches your widget usageKey convention)
 *  - emailHash: "<sha256(email)>" (console)
 *
 * Your usage_daily _id convention is: d:<hash>:<YYYY-MM-DD>
 * For widget, your addDailyUsage likely hashes keys too; if so, you may want
 * to reset by _id directly (passed from UI).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({} as any));
  const id = typeof body?.id === "string" ? body.id : null; // easiest & safest: reset by doc _id
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { db } = await getMongoConnection(process.env.DB!, process.env.MAINDBNAME!);
  const usage = db.collection("usage_daily");

  const res = await usage.updateOne(
    { _id: id, date: isoDay() },
    { $set: { tokens: 0, dollars: 0, updatedAt: new Date() } }
  );

  return NextResponse.json({ ok: true, matched: res.matchedCount, modified: res.modifiedCount });
}
