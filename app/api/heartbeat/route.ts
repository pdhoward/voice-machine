// /app/api/heartbeat/route.ts
import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { getActiveOtpSession } from "@/app/api/_lib/session";
import { sha256Hex } from "@/app/api/_lib/ids";
import { verifyWidgetSessionToken } from "@/lib/tenants/widgetToken";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const smSessionId: string | undefined = body?.sm_session_id;
  const authToken: string | undefined =
    typeof body?.authToken === "string" ? body.authToken : undefined;
  const payloadTenantId: string | undefined =
    typeof body?.tenantId === "string" ? body.tenantId : undefined;

  if (!smSessionId) {
    return NextResponse.json(
      { error: "Missing sm_session_id" },
      { status: 400 }
    );
  }

  // Try console OTP session first
  const sess = await getActiveOtpSession(req as any);

  const { db } = await getMongoConnection(
    process.env.DB!,
    process.env.MAINDBNAME!
  );
  const sessions =
    db.collection<RealtimeSessionDoc>("realtime_sessions");

  let filter: Partial<RealtimeSessionDoc> & { smSessionId: string };

  if (sess) {
    // 🔹 Console heartbeat
    const emailHash = sha256Hex(sess.email);
    filter = {
      identityKind: "console",
      emailHash,
      smSessionId,
      active: true,
    };
  } else if (authToken) {
    // 🔹 Widget heartbeat
    const claims = verifyWidgetSessionToken(authToken);
    if (!claims) {
      return NextResponse.json(
        { error: "Invalid widget auth token" },
        { status: 401 }
      );
    }
    const tenantId = claims.sub;

    // Optional sanity check: ensure caller's tenantId matches token
    if (payloadTenantId && payloadTenantId !== tenantId) {
      return NextResponse.json(
        { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
        { status: 403 }
      );
    }

    filter = {
      identityKind: "widget",
      tenantId,
      smSessionId,
      active: true,
    };
  } else {
    // Neither console session nor widget token → unauthorized
    return NextResponse.json(
      { error: "No active session or widget auth token" },
      { status: 401 }
    );
  }

  await sessions.updateOne(filter, {
    $set: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
