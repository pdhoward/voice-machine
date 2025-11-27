// app/api/agents/[agentId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseAgentMarkdown } from "@/lib/agent/agentMd";
import { getTenantConfig } from "@/lib/tenants/getTenantConfig";
import type { AgentConfig } from "@/types/tenant.schema";

type AgentDetailResponse = {
  ok: boolean;
  agent?: any;
  error?: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const agentId = params.agentId;
    const tenantId = req.nextUrl.searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json<AgentDetailResponse>(
        { ok: false, error: "Missing tenantId" },
        { status: 400 }
      );
    }

    const tenant = await getTenantConfig(tenantId);
    if (!tenant) {
      return NextResponse.json<AgentDetailResponse>(
        { ok: false, error: "Unknown tenant" },
        { status: 404 }
      );
    }

    const configs: AgentConfig[] = tenant.agentSettings ?? [];

    if (configs.length === 0) {
      return NextResponse.json<AgentDetailResponse>(
        { ok: false, error: "No agentSettings configured for tenant" },
        { status: 404 }
      );
    }

    // 1) Look for a matching agentId
    let cfg = configs.find((c) => c.agentId === agentId);

    // 2) If not found and agentId is something like "default", fall back to first
    if (!cfg && agentId === "default") {
      cfg = configs[0];
    }

    // 3) If still not found, gracefully error
    if (!cfg) {
      return NextResponse.json<AgentDetailResponse>(
        {
          ok: false,
          error: `No agent config found for agentId "${agentId}"`,
        },
        { status: 404 }
      );
    }

    const url = cfg.agentRepo.baseRawUrl; // full MD URL
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json<AgentDetailResponse>(
        {
          ok: false,
          error: `Failed to fetch markdown from ${url} (HTTP ${upstream.status})`,
        },
        { status: 502 }
      );
    }

    const markdown = await upstream.text();
    const structured = parseAgentMarkdown(markdown);

    return NextResponse.json<AgentDetailResponse>({
      ok: true,
      agent: structured,
    });
  } catch (err: any) {
    console.error("[/api/agents/[agentId]] error:", err);
    return NextResponse.json<AgentDetailResponse>(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
