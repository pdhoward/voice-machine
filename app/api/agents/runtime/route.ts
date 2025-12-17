// agents/runtime/route.ts

///////////////////////////////////////////////////////
///    api end point to retrieve .md docs for   //////
//     agent prompts + tool sets (/actions)      ////
////////////////////////////////////////////////////

import { NextRequest, NextResponse } from "next/server";
import type { AgentMdDocResponse } from "@/types/prompt-md";

// Keep response intentionally small + runtime-focused
type RuntimeAgentResponse = {
  ok: boolean;
  tenantId: string;
  agentId: string;
  agentName: string;
  instructions: string;
  toolNames: string[];
  warnings: string[];
  errors: string[];
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeToolName(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  if (x && typeof x === "object" && typeof (x as any).name === "string") return (x as any).name.trim();
  return null;
}

function buildInstructionsFromSections(sections: { title: string; body: string }[]) {
  const cleaned = (sections || [])
    .map((s) => ({
      title: String(s?.title || "").trim(),
      body: String(s?.body || "").trim(),
    }))
    .filter((s) => s.title || s.body);

  return cleaned
    .map((s) => (s.title ? `## ${s.title}\n\n${s.body}` : s.body))
    .join("\n\n")
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || "";
  const agentId = searchParams.get("agentId") || "";

  const warnings: string[] = [];
  const errors: string[] = [];

  if (!tenantId) errors.push("Missing tenantId");
  if (!agentId) errors.push("Missing agentId");

  if (errors.length) {
    const out: RuntimeAgentResponse = {
      ok: false,
      tenantId,
      agentId,
      agentName: "Unknown agent",
      instructions: "",
      toolNames: [],
      warnings,
      errors,
    };
    return NextResponse.json(out, { status: 400 });
  }

  // Reuse your existing validated agent-doc endpoint
  const agentDocUrl = `${origin}/api/agents/${encodeURIComponent(agentId)}?tenantId=${encodeURIComponent(tenantId)}`;

  let doc: AgentMdDocResponse | null = null;
  try {
    const res = await fetch(agentDocUrl, { cache: "no-store" });
    const text = await res.text();

    try {
      doc = text ? (JSON.parse(text) as AgentMdDocResponse) : null;
    } catch {
      doc = null;
    }

    if (!doc) {
      errors.push("Agent detail response was not JSON.");
    } else {
      if (!doc.ok) errors.push(doc.error || "Agent detail not ok.");

      if (Array.isArray(doc.validationErrors) && doc.validationErrors.length) {
        warnings.push(`Frontmatter validationErrors present (${doc.validationErrors.length})`);
      }
      if (Array.isArray(doc.spec_errors) && doc.spec_errors.length) {
        warnings.push(`Spec consistency errors present (${doc.spec_errors.length})`);
      }
      if (Array.isArray(doc.tools_errors) && doc.tools_errors.length) {
        warnings.push(`Tool validation issues present (${doc.tools_errors.length})`);
      }
    }
  } catch (e: any) {
    errors.push(e?.message || "Failed to fetch agent detail.");
  }

  const front = (doc as any)?.frontmatter;
  const agentName =
    (typeof front?.agent?.name === "string" && front.agent.name.trim())
      ? front.agent.name.trim()
      : agentId;

  const toolNames = Array.isArray(front?.tools)
    ? uniq(front.tools.map(normalizeToolName).filter(Boolean) as string[])
    : [];

  if (!toolNames.length) {
    warnings.push("No frontmatter.tools declared (runtime will not filter tools by spec).");
  }

  const sections = Array.isArray((doc as any)?.sections) ? (doc as any).sections : [];
  const instructions = buildInstructionsFromSections(sections);

  if (!instructions) warnings.push("No instruction sections found in MD doc.");

  const ok = errors.length === 0;

  const out: RuntimeAgentResponse = {
    ok,
    tenantId,
    agentId,
    agentName,
    instructions,
    toolNames,
    warnings,
    errors,
  };

  return NextResponse.json(out, { status: ok ? 200 : 200 });
}
