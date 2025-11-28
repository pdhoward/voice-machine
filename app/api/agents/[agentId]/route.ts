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

function ensureMarkdownUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().endsWith(".md")) return trimmed;
  return `${trimmed}.md`;
}

export async function GET( req: NextRequest, { params }: { params: Promise<{ agentId: string }> }){
  try {
    const {agentId} = await params;
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

    // 2) Optional fallback: if agentId is "default", use first
    if (!cfg && agentId === "default") {
      cfg = configs[0];
    }

    if (!cfg) {
      return NextResponse.json<AgentDetailResponse>(
        {
          ok: false,
          error: `No agent config found for agentId "${agentId}"`,
        },
        { status: 404 }
      );
    }

    // 👇 Normalize URL to ensure .md is present
    const finalUrl = ensureMarkdownUrl(cfg.agentRepo.baseRawUrl);

    const upstream = await fetch(finalUrl);
    if (!upstream.ok) {
      return NextResponse.json<AgentDetailResponse>(
        {
          ok: false,
          error: `Failed to fetch markdown from ${finalUrl} (HTTP ${upstream.status})`,
        },
        { status: 502 }
      );
    }

    const markdown = await upstream.text();
    const structured = await parseAgentMarkdown(markdown);

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
