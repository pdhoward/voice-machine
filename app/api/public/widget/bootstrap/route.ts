// app/api/public/widget/bootstrap/route.ts

///////////////////////////////////////////////////
///   note this is the widget that resides on   //
//    the tenants website ... so ttl should be //
//     be long -- while a visitor to the site //
//      has short ttl for security           //
//////////////////////////////////////////////

import { NextRequest, NextResponse } from "next/server";
import { loadTenantByWidgetKey } from "@/lib/tenants/loadTenants";
import { signWidgetSessionToken } from "@/lib/tenants/widgetToken";

export const runtime = "nodejs";

function withCORS(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: {
      "Access-Control-Allow-Origin":
        process.env.WIDGET_CORS_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function OPTIONS() {
  return withCORS({}, 204);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key) {
      return withCORS({ ok: false, error: "missing_widget_key" }, 400);
    }

    const origin = req.headers.get("origin") || undefined;

    const tenant = await loadTenantByWidgetKey(key);
    if (!tenant) {
      return withCORS({ ok: false, error: "tenant_not_found" }, 404);
    }

    const widgetEntry = (tenant.widgetKeys || []).find(
      (w: any) => w.key === key
    );

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
 
    // ✅ Origin binding: strict in prod, relaxed in dev, with host normalization
    if (widgetEntry.origin && origin) {
      const isProd = process.env.NODE_ENV === "production";

      try {
        const expectedUrl = new URL(widgetEntry.origin);
        const actualUrl = new URL(origin);

        const normalizeHost = (host: string) =>
          host.replace(/^www\./i, "").toLowerCase();

        const expectedHost = normalizeHost(expectedUrl.hostname); // e.g. "strategicmachines.ai" from tenant collection
        const actualHost = normalizeHost(actualUrl.hostname);     // e.g. "strategicmachines.ai"

        if (isProd && expectedHost !== actualHost) {
          console.warn(
            "[widget-bootstrap] origin mismatch",
            "expected host:",
            expectedHost,
            "got host:",
            actualHost
          );
          return withCORS(
            { ok: false, error: "origin_not_allowed" },
            403
          );
        }

        if (!isProd && expectedHost !== actualHost) {
          console.warn(
            "[widget-bootstrap] In DEV origin mismatch is allowed",
            "expected host:",
            expectedHost,
            "got host:",
            actualHost
          );
        }
      } catch (e) {
        console.warn(
          "[widget-bootstrap] origin parse error",
          "widgetEntry.origin=",
          widgetEntry.origin,
          "origin=",
          origin,
          e
        );
        // For now, don't fail hard on parse errors.
      }
    }


    const displayName =
      tenant.identity?.displayName ?? tenant.name ?? tenant.tenantId;
    const voiceAgent = tenant.config.voiceAgent;
    const allowedTools = tenant.agentSettings?.allowedTools ?? [];
    const primaryColor = tenant.flags?.betaFeatures
      ? "#16a34a"
      : "#2563eb";

    const widgetSessionToken = signWidgetSessionToken({
      tenant,
      widgetKeyEntry: widgetEntry,
      origin,
      // you can go back to "30m" or leave undefined when you're ready
      ttl: undefined,
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
    return withCORS({ ok: false, error: "server_error" }, 500);
  }
}
