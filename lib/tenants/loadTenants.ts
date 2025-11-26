// lib/tenants/loadTenant.ts

import { type Tenant } from "@/types/tenant.schema";
import { getTenantConfig, getTenantConfigByWidgetKey } from "@/lib/tenants/getTenantConfig";

const TENANTS_COLLECTION = "tenants";

export async function loadTenantById(tenantId: string): Promise<Tenant | null> {
  return getTenantConfig(tenantId);
}

export async function loadTenantByWidgetKey(widgetKey: string): Promise<Tenant | null> {
   return getTenantConfigByWidgetKey(widgetKey);
}
