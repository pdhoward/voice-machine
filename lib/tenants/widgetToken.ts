// lib/tenants/widgetToken.ts

///////////////////////////////////////////////////////
///   note when ttl is set to "" the token        ////
//               never expires                   ////
////////////////////////////////////////////////////
import jwt, { SignOptions } from "jsonwebtoken";
import type { Tenant, WidgetKey } from "@/types/tenant.schema";

export type WidgetSessionClaims = {
  sub: string;             // tenantId
  typ: "widget";
  key: string;             // widget key used
  origin?: string;         // origin that was bootstraped (if any)
  allowedTools?: string[];
  iat?: number;
  exp?: number;
};

function getSecret(): string {
  const secret = process.env.WIDGET_JWT_SECRET;
  if (!secret) {
    throw new Error("Missing WIDGET_JWT_SECRET in environment");
  }
  return secret;
}

export function signWidgetSessionToken(params: {
  tenant: Tenant;
  widgetKeyEntry: WidgetKey;
  origin?: string | null;
  // Use the same type jsonwebtoken expects for expiresIn
  ttl?: SignOptions["expiresIn"]; // e.g. "30m", 1800, etc.
}): string {
  const { tenant, widgetKeyEntry, origin, ttl} = params;

  const payload: WidgetSessionClaims = {
    sub: tenant.tenantId,
    typ: "widget",
    key: widgetKeyEntry.key,
    origin: origin || undefined,
    allowedTools: tenant.agentSettings?.allowedTools ?? [],
  };

  const options: SignOptions = {};
 if (ttl != null) {
    options.expiresIn = ttl;
  }

  // Now TS can clearly see this matches the (payload, secret, options) overload
  return jwt.sign(payload, getSecret(), options);
}

export function verifyWidgetSessionToken(token: string): WidgetSessionClaims | null {
  try {
    const decoded = jwt.verify(
      token,
      getSecret()
    ) as WidgetSessionClaims;
    if (decoded.typ !== "widget") return null;
    return decoded;
  } catch (err) {
    console.error("[verifyWidgetSessionToken] error", err);
    return null;
  }
}
