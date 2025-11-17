// app/api/public/widget/bootstrap/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loadTenantByWidgetKey } from "@/lib/tenants/loadTenants";
import { signWidgetSessionToken } from "@/lib/tenants/widgetToken";

export const runtime = "nodejs";

function withCORS(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: {
      // For dev you can use "*" — in prod, lock this down to specific domains
      "Access-Control-Allow-Origin":
        process.env.WIDGET_CORS_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// CORS preflight (not strictly necessary for simple GET, but safe to have)
export async function OPTIONS() {
  return withCORS({}, 204);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key) {
      return withCORS(
        { ok: false, error: "missing_widget_key" },
        400
      );
    }

    const origin = req.headers.get("origin") || undefined;

    const tenant = await loadTenantByWidgetKey(key);
    if (!tenant) {
      return withCORS(
        { ok: false, error: "tenant_not_found" },
        404
      );
    }

    // Find the matching widget key entry
    const widgetEntry = (tenant.widgetKeys || []).find((w: any) => w.key === key);

    if (!widgetEntry) {
      return withCORS(
        { ok: false, error: "widget_key_not_found" },
        404
      );
    }

    if (widgetEntry.revoked) {
      return withCORS(
        { ok: false, error: "widget_key_revoked" },
        403
      );
    }

    // Optional: enforce origin binding if configured
    if (widgetEntry.origin && origin && widgetEntry.origin !== origin) {
      console.warn(
        "[widget-bootstrap] origin mismatch",
        "expected:",
        widgetEntry.origin,
        "got:",
        origin
      );
      return withCORS(
        { ok: false, error: "origin_not_allowed" },
        403
      );
    }

    const displayName =
      tenant.identity?.displayName ?? tenant.name ?? tenant.tenantId;
    const voiceAgent = tenant.config.voiceAgent;
    const allowedTools = tenant.agentSettings?.allowedTools ?? [];
    const primaryColor = tenant.flags?.betaFeatures
      ? "#16a34a" // fun: green for beta tenants
      : "#2563eb";

    // Sign real widget session token (JWT)
    const widgetSessionToken = signWidgetSessionToken({
      tenant,
      widgetKeyEntry: widgetEntry,
      origin,
      ttl: "30m", // adjust if needed
    });

    return withCORS(
      {
        ok: true,
        tenantId: tenant.tenantId,
        displayName,
        branding: {
          primaryColor,
          logoUrl: tenant.identity?.domain
            ? `https://logo.clearbit.com/${tenant.identity.domain}`
            : undefined,
        },
        voiceAgent: {
          agentId: voiceAgent.agentId,
          defaultLanguage: voiceAgent.defaultLanguage,
          defaultVoice: voiceAgent.defaultVoice,
          maxConversationMinutes: voiceAgent.maxConversationMinutes,
          fallbackBehavior: voiceAgent.fallbackBehavior,
        },
        allowedTools,
        widgetSessionToken,
      },
      200
    );
  } catch (err: any) {
    console.error("[widget-bootstrap] error", err);
    return withCORS(
      { ok: false, error: "server_error" },
      500
    );
  }
}
