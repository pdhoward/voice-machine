// /app/api/session/route.ts

/////////////////////////////////////////////////////
///     DUAL AUTH PROCESS FOR CRITICAL ROUTE  //////
//   For /(web) route, users need to sign in    ///
//   For /widget, tenants need jwt token        //
/////////////////////////////////////////////////
// /app/api/session/route.ts
import { NextResponse, NextRequest } from "next/server";
import crypto from "crypto";
import getMongoConnection from "@/db/connections";
import { withRateLimit } from "@/app/api/_lib/rate-limit";
import { sha256Hex } from "@/app/api/_lib/ids";
import { getActiveOtpSession } from "@/app/api/_lib/session";
import { checkBotId } from "botid/server";
import { rateCfg } from "@/config/rate";
import { verifyWidgetSessionToken } from "@/lib/tenants/widgetToken";

const ALLOWED_MODELS = new Set(["gpt-realtime", "gpt_realtime_mini"]);
const ALLOWED_VOICES = new Set(["alloy", "coral"]);

function normalizeTools(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any, i: number) => {
    const rawName = t?.name ?? "unnamed_tool";
    if (!/^[a-zA-Z0-9_-]+$/.test(rawName)) {
      throw new Error(
        `Tool name "${rawName}" (tools[${i}].name) is invalid. Use ^[a-zA-Z0-9_-]+$`
      );
    }
    const description = t?.description ?? "";
    const parameters =
      t?.parameters && typeof t.parameters === "object"
        ? t.parameters
        : { type: "object", properties: {}, additionalProperties: false };
    return { type: "function", name: rawName, description, parameters };
  });
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

type RealtimeSessionDoc = {
  _id: string;          // "s:<identityKind>:<hash>:<opaqueId>"
  identityKind: "console" | "widget";
  emailHash?: string;
  tenantId?: string;
  startedAt: Date;
  lastSeenAt: Date;
  active: boolean;
};

type AuthContext =
  | {
      kind: "console";
      tenantId: string;
      email: string;
    }
  | {
      kind: "widget";
      tenantId: string;
      widgetKey: string;
    };

async function createSession(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set" },
      { status: 500 }
    );
  }

  // 1) Bot check
  const verdict = await checkBotId();
  if (verdict.isBot && !verdict.isVerifiedBot) {
    return NextResponse.json(
      {
        error: "Bot verification failed",
        code: "BOT_BLOCKED",
        userMessage:
          "We couldn’t verify this device. Please refresh and try again.",
      },
      { status: 403 }
    );
  }

  // 2) Resolve auth context: console OR widget
  let auth: AuthContext | null = null;

  // 2a) console: OTP-based session (tenant_session cookie)
  const otpSession = await getActiveOtpSession(req as any);
  if (otpSession) {
    auth = {
      kind: "console",
      tenantId: otpSession.tenantId,
      email: otpSession.email,
    };
  }

  // 2b) widget: JWT from Authorization header
  if (!auth) {   
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);   

    if (match) {
      const token = match[1].trim();
      const claims = verifyWidgetSessionToken(token);
      if (claims) {
        auth = {
          kind: "widget",
          tenantId: claims.sub,
          widgetKey: claims.key,
        };
      }     
    }
  }

  // 2c) DUAL CHECK - Enforce auth if config says so
  if (rateCfg.requireAuthForSession && !auth) {
    return NextResponse.json(
      {
        error: "No active session",
        code: "AUTH_REQUIRED",
        userMessage:
          "Please sign in or use a valid widget to start a voice session.",
      },
      { status: 401 }
    );
  }

  const body = await safeJson(req as any);

  // 3) Identity + sanitize inputs
  const model = ALLOWED_MODELS.has(body.model) ? body.model : "gpt-realtime";
  const voice = ALLOWED_VOICES.has(body.voice) ? body.voice : "alloy";
  const tools = normalizeTools(body.tools);

  // identityKey is used for concurrency quotas
  let identityKey: string;
  let emailHash: string | undefined;
  let tenantId: string | undefined;
  let identityKind: "console" | "widget" = "widget";

  if (auth?.kind === "console") {
    identityKind = "console";
    emailHash = sha256Hex(auth.email || "anon");
    tenantId = auth.tenantId;
    identityKey = `console:${emailHash}`;
  } else if (auth?.kind === "widget") {
    identityKind = "widget";
    tenantId = auth.tenantId;
    const tenantHash = sha256Hex(tenantId);
    identityKey = `widget:${tenantHash}`;
  } else {
    // fallback for unauthenticated flows if you ever allow them
    identityKind = "widget";
    identityKey = `anon:${sha256Hex("anon")}`;
  }

  // 4) Per-identity concurrent sessions cap
  const { db } = await getMongoConnection(
    process.env.DB!,
    process.env.MAINDBNAME!
  );
  const sessions = db.collection<RealtimeSessionDoc>("realtime_sessions");
  const maxConcurrent = rateCfg.maxConcurrentPerUser; // can later split per-tenant if you want
  const activeCount = await sessions.countDocuments({
    identityKind,
    ...(emailHash ? { emailHash } : {}),
    ...(tenantId ? { tenantId } : {}),
    active: true,
  });

  if (activeCount >= maxConcurrent) {
    return NextResponse.json(
      {
        error: "Too many active sessions",
        code: "CONCURRENT_SESSIONS",
        userMessage:
          "There is already an active voice session. Please close the other session or wait a moment, then try again.",
      },
      { status: 429 }
    );
  }

  // 5) Create OpenAI Realtime session
  const payload = {
    model,
    voice,
    modalities: ["audio", "text"],
    instructions: body.instructions ?? "Be helpful and concise.",
    tool_choice: body.tool_choice ?? "auto",
    tools,
    turn_detection:
      body.turn_detection ?? {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
        create_response: true,
      },
  };

  const upstream = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("[/api/session] upstream error:", errText);
    return NextResponse.json({ error: errText }, { status: upstream.status });
  }

  const data = await upstream.json();

  // 6) Track local session for quotas/heartbeat/idle
  const opaqueId: string = data?.id || crypto.randomUUID();

  await sessions.updateOne(
    { _id: `s:${identityKind}:${identityKey}:${opaqueId}` },
    {
      $set: {
        identityKind,
        emailHash,
        tenantId,
        startedAt: new Date(),
        lastSeenAt: new Date(),
        active: true,
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ...data, sm_session_id: opaqueId });
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, () => createSession(req), {
    sessionPerMin: rateCfg.sessionPerMin,
    maxDailyTokens: rateCfg.maxDailyTokens,
    maxDailyDollars: rateCfg.maxDailyDollars,
  });
}
