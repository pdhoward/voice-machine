import { NextRequest } from "next/server";
import { requireAdmin } from "@/app/api/_lib/adminAuth";
import { getStreamDb } from "@/db/streamClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send("hello", { ok: true, ts: new Date().toISOString() });

      const { db } = await getStreamDb();

      const realtime = db.collection("realtime_sessions");
      const usage = db.collection("usage_daily");
      const ratelimits = db.collection("ratelimits");

      let closed = false;
      const ping = setInterval(() => {
        if (!closed) send("ping", { ts: new Date().toISOString() });
      }, 20_000);

      try {
        // Keep pipeline minimal; UI refetches snapshots anyway.
        const rtStream = realtime.watch([], { fullDocument: "updateLookup" });
        const usageStream = usage.watch([], { fullDocument: "updateLookup" });
        const rateStream = ratelimits.watch([], { fullDocument: "updateLookup" });

        const forward = async (name: string, cs: any) => {
          for await (const change of cs) {
            if (closed) break;
            send(name, {
              op: change.operationType,
              key: change.documentKey || null,
              doc: change.fullDocument || null,
              ts: new Date().toISOString(),
            });
          }
        };

        await Promise.race([
          forward("realtime_sessions", rtStream),
          forward("usage_daily", usageStream),
          forward("ratelimits", rateStream),
        ]);

        rtStream.close();
        usageStream.close();
        rateStream.close();
      } catch (err: any) {
        send("error", { message: String(err?.message || err) });
      } finally {
        closed = true;
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
