// app/api/admin/tenants/route.ts
import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";

const TENANTS_COLLECTION = "tenants";

async function getWebDb() {
  const uri = process.env.DB;
  const dbName = process.env.WEBDBNAME;
  if (!uri || !dbName) {
    throw new Error("Missing DB or WEBDBNAME env variables");
  }
  const { db } = await getMongoConnection(uri, dbName);
  return db;
}

type AdminTenantItem = {
  tenantId: string;
  name: string;
  status: string;
};

type AdminTenantListResponse = {
  ok: boolean;
  tenants: AdminTenantItem[];
  error?: string;
};

export async function GET(req: NextRequest) {
  try {
    const db = await getWebDb();

    // Optional simple text search by tenantId or name
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const filter: any = {};
    if (q) {
      filter.$or = [
        { tenantId: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
      ];
    }

    const docs = await db
      .collection(TENANTS_COLLECTION)
      .find(filter, { projection: { tenantId: 1, name: 1, status: 1 } })
      .sort({ tenantId: 1 })
      .limit(200)
      .toArray();

    const tenants: AdminTenantItem[] = docs.map((d: any) => ({
      tenantId: d.tenantId,
      name: d.name ?? d.tenantId,
      status: d.status ?? "unknown",
    }));

    return NextResponse.json<AdminTenantListResponse>({
      ok: true,
      tenants,
    });
  } catch (err: any) {
    console.error("[/api/admin/tenants] error:", err);
    return NextResponse.json<AdminTenantListResponse>(
      { ok: false, tenants: [], error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
