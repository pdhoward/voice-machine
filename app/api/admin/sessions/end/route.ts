import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { requireAdmin } from "@/app/api/_lib/adminAuth";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({} as any));
  const smSessionId = typeof body?.smSessionId === "string" ? body.smSessionId : null;
  if (!smSessionId) {
    return NextResponse.json({ error: "Missing smSessionId" }, { status: 400 });
  }

  const { db } = await getMongoConnection(process.env.DB!, process.env.MAINDBNAME!);
  const sessions = db.collection("realtime_sessions");

  const res = await sessions.updateMany(
    { smSessionId, active: true },
    {
      $set: {
        active: false,
        endedAt: new Date(),
        endedReason: "ADMIN_END",
      },
    }
  );

  return NextResponse.json({ ok: true, matched: res.matchedCount, modified: res.modifiedCount });
}
