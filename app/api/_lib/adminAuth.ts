import { NextRequest, NextResponse } from "next/server";
import { getActiveOtpSession } from "@/app/api/_lib/session";

/**
 * Minimal admin gate:
 * - requires console OTP session cookie
 * - optionally restricts to allowlisted emails via ADMIN_EMAILS
 *
 * ADMIN_EMAILS="a@x.com,b@y.com"
 */
export async function requireAdmin(req: NextRequest) {
  const sess = await getActiveOtpSession(req as any);

  if (!sess) {
    return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allow.length > 0 && !allow.includes(sess.email.toLowerCase())) {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, sess };
}
