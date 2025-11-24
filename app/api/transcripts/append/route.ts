// /app/api/transcripts/append/route.ts
import { NextRequest, NextResponse } from "next/server";
import getMongoConnection from "@/db/connections";
import { getActiveOtpSession } from "@/app/api/_lib/session";
import type { UpdateFilter } from "mongodb";
import type {
  UserTranscriptChunk,
  TranscriptMessage,
} from "@/types/transcript";
import { verifyWidgetSessionToken } from "@/lib/tenants/widgetToken";
import { sha256Hex } from "@/app/api/_lib/ids";

const MAX_MSGS_PER_CHUNK = 250;
const MAX_BYTES_PER_CHUNK = 1_000_000;

function roughSizeOf(obj: any) {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 1024;
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({} as any));
    const messages = (Array.isArray(payload?.messages)
      ? payload.messages
      : []) as TranscriptMessage[];

    if (!messages.length) {
      return NextResponse.json({ ok: true, appended: 0 });
    }

    const authToken =
      typeof payload?.authToken === "string" ? payload.authToken : null;
    const payloadTenantId =
      typeof payload?.tenantId === "string" ? payload.tenantId : null;

    // --- Resolve session context: console (OTP) OR widget (authToken) ---
    const sess = await getActiveOtpSession(req as any);

    let tenantId: string | null = null;
    let sessionTokenHash: string | null = null;
    let email: string | null = null;

    if (sess) {
      // Console demo session
      tenantId = sess.tenantId;
      sessionTokenHash = sess.sessionTokenHash;
      email = sess.email ?? null;
    } else if (authToken) {
      // Widget commercial session
      const claims = verifyWidgetSessionToken(authToken);
      if (!claims) {
        return NextResponse.json(
          { error: "Invalid widget auth token" },
          { status: 401 }
        );
      }

      tenantId = claims.sub;
      // Optional sanity check: if client passed tenantId, enforce it matches token
      if (payloadTenantId && payloadTenantId !== tenantId) {
        return NextResponse.json(
          { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
          { status: 403 }
        );
      }

      sessionTokenHash = sha256Hex(authToken);
      email = null;
    } else {
      return NextResponse.json(
        { error: "No active session or widget auth token" },
        { status: 401 }
      );
    }

    if (!tenantId || !sessionTokenHash) {
      return NextResponse.json(
        { error: "Missing tenant/session context" },
        { status: 500 }
      );
    }

    const { db } = await getMongoConnection(
      process.env.DB!,
      process.env.MAINDBNAME!
    );
    const coll =
      db.collection<UserTranscriptChunk>("user_transcripts");

    const last = await coll.findOne(
      {
        kind: "user_transcript_chunk",
        tenantId,
        sessionTokenHash,
      },
      { sort: { chunkIndex: -1 } }
    );

    let chunkIndex = last?.chunkIndex ?? 0;
    let count = last?.count ?? 0;
    let byteSize = last?.byteSize ?? 0;

    const incomingSize = roughSizeOf(messages);
    const needRollover =
      !last ||
      last.finalizedAt != null ||
      count + messages.length > MAX_MSGS_PER_CHUNK ||
      byteSize + incomingSize > MAX_BYTES_PER_CHUNK;

    if (needRollover) {
      chunkIndex = (last?.chunkIndex ?? -1) + 1;
      count = 0;
      byteSize = 0;
    }

    const now = new Date();
    const filter = {
      kind: "user_transcript_chunk" as const,
      tenantId,
      sessionTokenHash,
      chunkIndex,
    };

    const update: UpdateFilter<UserTranscriptChunk> = {
      $setOnInsert: {
        kind: "user_transcript_chunk",
        tenantId,
        sessionTokenHash,
        email,
        chunkIndex,
        createdAt: now,
      },
      $push: { messages: { $each: messages } },
      $set: { updatedAt: now },
      $inc: { count: messages.length, byteSize: incomingSize },
    };

    await coll.updateOne(filter, update, { upsert: true });

    return NextResponse.json({
      ok: true,
      chunkIndex,
      appended: messages.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "append failed" },
      { status: 500 }
    );
  }
}
