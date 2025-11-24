// /app/api/usage/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { getActiveOtpSession } from "@/app/api/_lib/session";
import { addDailyUsage } from "@/app/api/_lib/usage";
import { estimateRealtimeUSD } from "@/config/costmodel";
import { verifyWidgetSessionToken } from "@/lib/tenants/widgetToken";

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));

  const text_in = toNum(body.text_in);
  const text_out = toNum(body.text_out);
  const audio_in = toNum(body.audio_in);
  const audio_out = toNum(body.audio_out);
  const tokens = text_in + text_out + audio_in + audio_out;

  if (tokens <= 0) {
    return NextResponse.json({ ok: true, tokens: 0, dollars: 0 });
  }

  const authToken: string | null =
    typeof body?.authToken === "string" ? body.authToken : null;
  const payloadTenantId: string | null =
    typeof body?.tenantId === "string" ? body.tenantId : null;

  // Try console OTP session first
  const sess = await getActiveOtpSession(req as any);

  let usageKey: string | null = null;

  if (sess) {
    // 🔹 Console usage: same behavior as before
    usageKey = sess.email;
  } else if (authToken) {
    // 🔹 Widget usage: derive tenant from widget JWT
    const claims = verifyWidgetSessionToken(authToken);
    if (!claims) {
      return NextResponse.json(
        { error: "Invalid widget auth token" },
        { status: 401 }
      );
    }

    const tenantId = claims.sub;

    if (payloadTenantId && payloadTenantId !== tenantId) {
      return NextResponse.json(
        { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
        { status: 403 }
      );
    }

    // Use a pseudo-identity so addDailyUsage can still be reused
    usageKey = `tenant:${tenantId}`;
  } else {
    return NextResponse.json(
      { error: "No active session or widget auth token" },
      { status: 401 }
    );
  }

  const dollars = estimateRealtimeUSD({
    textIn: text_in,
    textOut: text_out,
    audioIn: audio_in,
    audioOut: audio_out,
  });

  const { db } = await getMongoConnection(
    process.env.DB!,
    process.env.MAINDBNAME!
  );
  await addDailyUsage(db, usageKey, { tokens, dollars });

  return NextResponse.json({ ok: true, tokens, dollars });
}
