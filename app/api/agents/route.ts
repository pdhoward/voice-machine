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

// minimal config-level safety checks
function validateAgentConfig(cfg: AgentConfig): string[] {
  const errors: string[] = [];

  if (!cfg.agentId || typeof cfg.agentId !== "string") {
    errors.push("agentId is required and must be a string.");
  }

  if (!cfg.agentRepo || typeof cfg.agentRepo.baseRawUrl !== "string") {
    errors.push("agentRepo.baseRawUrl is required and must be a string.");
  }

  return errors;
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
    const agents: AgentListItem[] = [];

    for (const cfg of configs) {
      const errs = validateAgentConfig(cfg);
      if (errs.length > 0) {
        // log but don't break the list endpoint;
        // serious issues will be caught in the detail endpoint.
        console.warn(
          `[/api/agents] Invalid AgentConfig for agentId="${cfg.agentId}":`,
          errs
        );
      }

      agents.push({
        agentId: cfg.agentId,
        name: cfg.label || cfg.agentId,
        filename: cfg.agentRepo?.baseRawUrl
          ? inferFilenameFromUrl(cfg.agentRepo.baseRawUrl)
          : undefined,
      });
    }

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
