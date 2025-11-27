// app/api/agents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTenantConfig } from "@/lib/tenants/getTenantConfig";
import type { AgentConfig } from "@/types/tenant.schema";

type AgentListItem = {
  agentId: string;
  name: string;
  filename?: string;
};

type AgentListResponse = {
  ok: boolean;
  agents: AgentListItem[];
  error?: string;
};

function inferFilenameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1];
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json<AgentListResponse>(
        { ok: false, agents: [], error: "Missing tenantId" },
        { status: 400 }
      );
    }

    const tenant = await getTenantConfig(tenantId);
    if (!tenant) {
      return NextResponse.json<AgentListResponse>(
        { ok: false, agents: [], error: "Unknown tenant" },
        { status: 404 }
      );
    }

    const configs: AgentConfig[] = tenant.agentSettings ?? [];

    const agents: AgentListItem[] = configs.map((cfg) => ({
      agentId: cfg.agentId,
      name: cfg.label || cfg.agentId,
      filename: inferFilenameFromUrl(cfg.agentRepo.baseRawUrl),
    }));

    return NextResponse.json<AgentListResponse>({
      ok: true,
      agents,
    });
  } catch (err: any) {
    console.error("[/api/agents] error:", err);
    return NextResponse.json<AgentListResponse>(
      { ok: false, agents: [], error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
