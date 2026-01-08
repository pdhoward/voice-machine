import type { Db, Collection } from "mongodb";
import { ipFromHeaders, sha256Hex } from "@/app/api/_lib/ids";

/////////////////////////////////////////
//     risk scoring for widgets      ///
//     detecting abuse patterns      //
//////////////////////////////////////

type AbuseDoc = {
  _id: string;
  count: number;
  createdAt: Date;
  windowSec?: number;
  day?: string;
};

export async function checkWidgetAbuse(
  db: Db,
  req: Request,
  params: { tenantId: string; widgetKey: string }
): Promise<
  | { ok: true }
  | { ok: false; code: "STEP_UP_REQUIRED"; stepUp: { kind: "captcha" | "otp"; reason: string } }
> {
  const ip = ipFromHeaders(req as any);
  const ua = (req.headers.get("user-agent") || "").slice(0, 200);
  const uaHash = sha256Hex(ua);

  const coll: Collection<AbuseDoc> = db.collection("abuse_signals");

  const winSec = 60;
  const winId = Math.floor(Date.now() / 1000 / winSec);
  const day = new Date().toISOString().slice(0, 10);

  // Keys
  const kTenantIpMin = `t:${params.tenantId}:ip:${ip}:m:${winId}`;
  const kIpMin = `ip:${ip}:m:${winId}`;
  const kTenantIpDay = `t:${params.tenantId}:ip:${ip}:d:${day}`;
  const kTenantUaDay = `t:${params.tenantId}:ua:${uaHash}:d:${day}`;

  // Increment counters
  const bulk = coll.initializeUnorderedBulkOp();
  for (const key of [kTenantIpMin, kIpMin, kTenantIpDay, kTenantUaDay]) {
    bulk.find({ _id: key }).upsert().updateOne({
      $inc: { count: 1 },
      $setOnInsert: { createdAt: new Date(), windowSec: key.includes(":m:") ? winSec : undefined, day },
    });
  }
  // @ts-ignore
  if (bulk.length) await bulk.execute();

  const docs = await coll.find({ _id: { $in: [kTenantIpMin, kIpMin, kTenantIpDay] } }).toArray();
  const tenantIpMin = docs.find((d) => d._id === kTenantIpMin)?.count ?? 0;
  const ipMin = docs.find((d) => d._id === kIpMin)?.count ?? 0;
  const tenantIpDay = docs.find((d) => d._id === kTenantIpDay)?.count ?? 0;

  // --- Policy (tune these) ---
  // Normal human: 1-2 session starts/min max.
  // Suspicious: repeated starts without normal usage, bots, scraping.
  const TOO_MANY_STARTS_TENANT_IP_PER_MIN = 6;
  const TOO_MANY_STARTS_IP_PER_MIN = 20;
  const TOO_MANY_STARTS_TENANT_IP_PER_DAY = 80;

  if (
    tenantIpMin > TOO_MANY_STARTS_TENANT_IP_PER_MIN ||
    ipMin > TOO_MANY_STARTS_IP_PER_MIN ||
    tenantIpDay > TOO_MANY_STARTS_TENANT_IP_PER_DAY
  ) {
    return {
      ok: false,
      code: "STEP_UP_REQUIRED",
      stepUp: {
        kind: "captcha",
        reason: `Suspicious session start rate (tenantIpMin=${tenantIpMin}, ipMin=${ipMin}, tenantIpDay=${tenantIpDay})`,
      },
    };
  }

  return { ok: true };
}
