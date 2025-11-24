// /app/api/transcripts/finalize/route.ts
import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { getActiveOtpSession } from "@/app/api/_lib/session";
import { verifyWidgetSessionToken } from "@/lib/tenants/widgetToken";
import { sha256Hex } from "@/app/api/_lib/ids";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({} as any));
    const authToken =
      typeof payload?.authToken === "string" ? payload.authToken : null;
    const payloadTenantId =
      typeof payload?.tenantId === "string" ? payload.tenantId : null;

    const sess = await getActiveOtpSession(req as any);

    let tenantId: string | null = null;
    let sessionTokenHash: string | null = null;

    if (sess) {
      // Console session
      tenantId = sess.tenantId;
      sessionTokenHash = sess.sessionTokenHash;
    } else if (authToken) {
      // Widget session
      const claims = verifyWidgetSessionToken(authToken);
      if (!claims) {
        return NextResponse.json(
          { error: "Invalid widget auth token" },
          { status: 401 }
        );
      }

      tenantId = claims.sub;
      if (payloadTenantId && payloadTenantId !== tenantId) {
        return NextResponse.json(
          { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
          { status: 403 }
        );
      }

      sessionTokenHash = sha256Hex(authToken);
    } else {
      return NextResponse.json(
        { error: "No active session or widget auth token" },
        { status: 401 }
      );
    }

    if (!tenantId || !sessionTokenHash) {
      return NextResponse.json(
        { error: "Missing tenant/session context" },
        { status: 500 }
      );
    }

    const { db } = await getMongoConnection(
      process.env.DB!,
      process.env.MAINDBNAME!
    );
    const coll = db.collection("user_transcripts");

    const now = new Date();
    const res = await coll.updateMany(
      {
        kind: "user_transcript_chunk",
        tenantId,
        sessionTokenHash,
        finalizedAt: { $exists: false },
      },
      { $set: { finalizedAt: now, updatedAt: now } }
    );

    return NextResponse.json({
      ok: true,
      modified: res.modifiedCount,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "finalize failed" },
      { status: 500 }
    );
  }
}
