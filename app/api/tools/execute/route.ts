// src/app/api/tools/execute/route.ts
import { NextRequest, NextResponse } from "next/server";
import { tpl, applyTemplate, pruneEmpty } from "@/lib/utils";
import getMongoConnection from "@/db/connections";

/** Simple trace id for correlating logs across hops */
const mkTraceId = (prefix = "exec") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

/** Redact obvious secrets in headers */
function redactHeaders(h: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) {
    const low = k.toLowerCase();
    out[k] =
      low.includes("authorization") || low.includes("api-key") || low.includes("x-api-key")
        ? "[REDACTED]"
        : v;
  }
  return out;
}

/** Truncate large payloads to keep logs readable */
function snap(v: unknown, n = 1500) {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s) return s;
    return s.length > n ? s.slice(0, n) + "…(truncated)" : s;
  } catch {
    return String(v);
  }
}

/** Normalize an origin string to URL.origin (no trailing slash, includes scheme+host+port) */
function normalizeOrigin(origin: string): string {
  const u = new URL(origin);
  return u.origin;
}

/** Extract origin from an absolute urlTemplate. (Works even if query contains {{secrets.*}}) */
function extractOriginFromUrlTemplate(urlTemplate: string): string | null {
  const m = String(urlTemplate || "").match(/^https?:\/\/[^/]+/i);
  return m ? m[0] : null;
}

/** Collect all secret token names like {{secrets.booking_api_key}} from a string */
function collectSecretNamesFromString(s: string): string[] {
  const out = new Set<string>();
  const re = /{{\s*secrets\.([a-zA-Z0-9_]+)\s*}}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.add(m[1]);
  return [...out];
}

/** Collect secret names from the descriptor (urlTemplate, headers, jsonBodyTemplate) */
function collectSecretNamesFromDescriptor(descriptor: any): string[] {
  const out = new Set<string>();

  // urlTemplate
  for (const n of collectSecretNamesFromString(String(descriptor?.http?.urlTemplate ?? ""))) out.add(n);

  // headers (values)
  const headers = descriptor?.http?.headers ?? {};
  for (const v of Object.values(headers)) {
    for (const n of collectSecretNamesFromString(String(v))) out.add(n);
  }

  // jsonBodyTemplate (stringify to scan tokens)
  if (descriptor?.http?.jsonBodyTemplate != null) {
    const s = JSON.stringify(descriptor.http.jsonBodyTemplate);
    for (const n of collectSecretNamesFromString(s)) out.add(n);
  }

  return [...out];
}

/** 
 * - Lookup the tenant doc in `tenants`
 * - Find apiKeys[] entry matching the tool origin
 * - Throw if missing/revoked
 *
 * NOTE: Map *any* secrets.* token for this descriptor to the same origin key,
 * because tenant model stores keys by origin. (booking_api_key / spoonacular_api_key etc.)
 */
async function resolveSecretsFromMongo(params: {
  tenantId: string;
  origin: string;
  secretNames: string[];
}) {
  const { tenantId, origin, secretNames } = params;

  const normalizedOrigin = normalizeOrigin(origin);

  const { db } = await getMongoConnection(process.env.DB!, process.env.WEBDBNAME!);

  const tenant = await db.collection("tenants").findOne(
    { tenantId },
    { projection: { tenantId: 1, apiKeys: 1 } }
  );

  if (!tenant) {
    throw new Error(`Tenant not found: tenantId="${tenantId}"`);
  }

  const apiKeys: Array<any> = Array.isArray(tenant.apiKeys) ? tenant.apiKeys : [];

  const match = apiKeys.find((k) => {
    if (!k?.origin || k?.revoked) return false;
    try {
      return normalizeOrigin(String(k.origin)) === normalizedOrigin;
    } catch {
      return false;
    }
  });

  if (!match?.key) {
    // This is the "critical" failure mode you asked for
    const names = secretNames.length ? secretNames.join(", ") : "(unknown)";
    throw new Error(
      `Missing API key for tenantId="${tenantId}" origin="${normalizedOrigin}" requiredSecrets="${names}"`
    );
  }

  // Build { booking_api_key: "...", spoonacular_api_key: "..." } etc.
  // Data model is per-origin, so we use the same key for all secret tokens in this descriptor.
  const secrets: Record<string, string> = {};
  for (const n of secretNames) secrets[n] = String(match.key);

  return secrets;
}

// Enhanced URL validation to prevent SSRF
function validateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error(`Invalid protocol: ${protocol}. Only http/https allowed.`);
    }
    // Prevent localhost/internal IPs (basic SSRF mitigation)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname === "[::1]"
    ) {
      throw new Error("Access to internal/localhost URLs is prohibited.");
    }
    return parsed.toString();
  } catch (err: any) {
    throw new Error(`Invalid URL: ${err.message} url: ${url}`);
  }
}

export async function POST(req: NextRequest) {
  const traceId = req.headers.get("x-trace-id") ?? mkTraceId();
  try {
    const started = Date.now();
    const { descriptor, args } = await req.json();

    if (!descriptor || typeof descriptor !== "object" || !descriptor.http) {
      throw new Error("Invalid descriptor: http config required.");
    }
    if (!args || typeof args !== "object") {
      throw new Error("Invalid args: object required.");
    }

    // note even though tenant_id may be passed in with args
    // go with the main tenantId on the descriptor - it is the tool owner

    const toolName: string = descriptor?.name ?? "(unknown)";
    const tenantId: string = descriptor?.tenantId ?? "(unknown)";   

    const rawUrl = String(descriptor.http.urlTemplate || "");
    if (!rawUrl) {
      throw new Error("urlTemplate is required in http config.");
    }

    // ---- detect secrets + resolve from Mongo by origin ----------------
    const secretNames = collectSecretNamesFromDescriptor(descriptor);
    let secrets: Record<string, string> = {};

    if (secretNames.length > 0) {
      const origin = extractOriginFromUrlTemplate(rawUrl);
      if (!origin) {
        throw new Error(
          `Descriptor requires secrets (${secretNames.join(
            ", "
          )}) but urlTemplate is not absolute, cannot derive origin: "${rawUrl}"`
        );
      }

      secrets = await resolveSecretsFromMongo({
        tenantId,
        origin,
        secretNames,
      });
    }
    // ----------------------------------------------------------------------

    // Build ctx (same shape as before: ctx.secrets.* available for tpl())
    const ctx = { ...args, args, secrets };

    const method = descriptor?.http?.method?.toUpperCase() ?? "POST";
    const templatedUrl = tpl(rawUrl, ctx);

    // Build and validate URL
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const host = req.headers.get("host") ?? "localhost";
    let targetUrl = templatedUrl;
    if (!/^(?:https?:)?\/\//.test(templatedUrl)) {
      // Relative URL: prepend base
      targetUrl = new URL(templatedUrl, `${proto}://${host}`).toString();
    }
    targetUrl = validateUrl(targetUrl); // SSRF protection

    // Headers templating
    const headerTemplate = descriptor.http?.headers ?? {};
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(headerTemplate)) {
      headers[k] = tpl(String(v), ctx);
    }
    headers["x-trace-id"] = traceId; // pass through for downstream services

    // Template/prepare body
    let body: string | undefined;
    let bodyObj: any = undefined;

    if (descriptor.http?.jsonBodyTemplate != null) {
      bodyObj = applyTemplate(descriptor.http.jsonBodyTemplate, ctx);
      if (descriptor.http.pruneEmpty) {
        bodyObj = pruneEmpty(bodyObj);
      }
      body = JSON.stringify(bodyObj);
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
    }

    //---- OUTBOUND LOG -----------------------------------------------------
    console.log(`[EXEC: OUTBOUND] ${traceId} → ${method} ${targetUrl}`, {
      tool: toolName,
      tenantId,
      okField: descriptor.http.okField ?? "(http 2xx)",
      hasBody: body != null,
      headers: redactHeaders(headers),
      body: snap(bodyObj),
    });

    // Do the call
    const timeoutMs = Number(descriptor.http.timeoutMs) || 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const r = await fetch(targetUrl, { method, headers, body, signal: controller.signal });
    clearTimeout(timeout);

    const text = await r.text();

    // ---- INBOUND LOG ------------------------------------------------------
    console.log(`[EXEC: INBOUND] ${traceId} ← ${r.status} (${Date.now() - started}ms)`, {
      tool: toolName,
      respHeaders: Object.fromEntries(r.headers.entries()),
      response: snap(text),
    });

    // Return JSON if possible, else text
    try {
      const j = JSON.parse(text);
      return NextResponse.json(j, { status: r.status });
    } catch {
      return new NextResponse(text, { status: r.status });
    }
  } catch (err: any) {
    console.error(`[EXEC] ${traceId} ERROR`, {
      error: err?.message || String(err),
      stack: err?.stack,
    });
    return NextResponse.json({ ok: false, error: err?.message || "server_error" }, { status: 500 });
  }
}
