// lib/tenants/loadTenant.ts
import getMongoConnection from "@/db/connections";
import { TenantSchema, type Tenant } from "@/types/tenant.schema";

const TENANTS_COLLECTION = "tenants";

// Optional helper if you ever ingest extended JSON (Compass exports, etc.)
function unwrapMongoExtendedJSON(v: any): any {
  if (Array.isArray(v)) return v.map(unwrapMongoExtendedJSON);
  if (v && typeof v === "object") {
    if ("$numberInt" in v) return parseInt(v.$numberInt, 10);
    if ("$numberLong" in v) return parseInt(v.$numberLong, 10);
    if ("$numberDouble" in v) return parseFloat(v.$numberDouble);
    if ("$numberDecimal" in v) return Number(v.$numberDecimal);

    if ("$date" in v) {
      const raw = v.$date;
      if (typeof raw === "string") return new Date(raw);
      if (raw && typeof raw === "object" && "$numberLong" in raw) {
        return new Date(Number(raw.$numberLong));
      }
    }

    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) out[k] = unwrapMongoExtendedJSON(val);
    return out;
  }
  return v;
}

async function getWebDb() {
  const uri = process.env.DB;
  const dbName = process.env.WEBDBNAME;
  if (!uri || !dbName) {
    throw new Error("Missing DB or WEBDBNAME env variables");
  }
  const { db } = await getMongoConnection(uri, dbName);
  return db;
}

export async function loadTenantById(tenantId: string): Promise<Tenant | null> {
  const db = await getWebDb();
  const raw = await db.collection(TENANTS_COLLECTION).findOne({ tenantId });

  if (!raw) return null;

  const cleaned = unwrapMongoExtendedJSON(raw);
  const parsed = TenantSchema.safeParse(cleaned);
  if (!parsed.success) {
    console.error("[loadTenantById] schema error", parsed.error.format());
    return null;
  }
  return parsed.data;
}

export async function loadTenantByWidgetKey(widgetKey: string): Promise<Tenant | null> {
  const db = await getWebDb();
  const raw = await db.collection(TENANTS_COLLECTION).findOne({
    "widgetKeys.key": widgetKey,
    status: { $in: ["active", "trial"] }, // only allow active/trial tenants
  });

  if (!raw) return null;

  const cleaned = unwrapMongoExtendedJSON(raw);
  const parsed = TenantSchema.safeParse(cleaned);
  if (!parsed.success) {
    console.error("[loadTenantByWidgetKey] schema error", parsed.error.format());
    return null;
  }
  return parsed.data;
}
