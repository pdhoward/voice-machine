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

type ToolGroup = {
  source: "registry" | "core" | string;
  tenantId?: string;
  names: string[];
};

function isToolGroup(x: any): x is ToolGroup {
  return (
    x &&
    typeof x === "object" &&
    typeof x.source === "string" &&
    Array.isArray(x.names)
  );
}


function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function extractToolNamesFromGroupedFrontmatter(
  frontTools: unknown,
  warnings: string[]
): string[] {
  if (!Array.isArray(frontTools)) return [];

  const out: string[] = [];

  for (const g of frontTools) {
    if (!isToolGroup(g)) {
      warnings.push("frontmatter.tools contains an invalid entry (expected {source,names[]}).");
      continue;
    }

    // Soft validation: registry groups should have tenantId
    if (g.source === "registry" && (!g.tenantId || !String(g.tenantId).trim())) {
      warnings.push("tools group with source=registry is missing tenantId.");
    }

    for (const n of g.names) {
      if (typeof n === "string" && n.trim()) out.push(n.trim());
      else warnings.push("tools group contains a non-string/empty tool name.");
    }
  }

  return uniq(out);
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
  
  const toolNames = extractToolNamesFromGroupedFrontmatter(front?.tools, warnings);

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
