// app/api/agents/[agentId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseAgentMarkdown } from "@/lib/agent/agentMd";
import { getTenantConfig } from "@/lib/tenants/getTenantConfig"; // note: path "tenant", not "tenants"

export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const agentId = params.agentId;
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json(
        { error: "Missing tenantId" },
        { status: 400 }
      );
    }

    const tenant = await getTenantConfig(tenantId);
    if (!tenant) {
      return NextResponse.json(
        { error: "Unknown tenant" },
        { status: 404 }
      );
    }

    // ⬇ we’ll fix agentRepo typing in the next section
    const repo = tenant.agentSettings?.agentRepo;
    if (!repo?.baseRawUrl) {
      return NextResponse.json(
        { error: "No agentRepo configured for tenant" },
        { status: 400 }
      );
    }

    const baseRawUrl = repo.baseRawUrl.replace(/\/$/, "");
    const url = `${baseRawUrl}/${agentId}.md`;

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch markdown from ${url}`,
          status: upstream.status,
        },
        { status: 502 }
      );
    }

    const markdown = await upstream.text();
    const structured = parseAgentMarkdown(markdown);

    return NextResponse.json({ ok: true, agent: structured });
  } catch (err: any) {
    console.error("[/api/agents/[agentId]] error:", err);
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
