// app/api/agents/[agentId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import matter from "gray-matter";
import { z } from "zod";
import { getTenantConfig } from "@/lib/tenants/getTenantConfig";
import type { AgentConfig } from "@/types/tenant.schema";
import getMongoConnection from "@/db/connections";
import type { AgentMdDocResponse } from "@/types/prompt-md"; // adjust path

function ensureMarkdownUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().endsWith(".md")) return trimmed;
  return `${trimmed}.md`;
}

// ---- Zod validation: required fields only, allow extra keys ----
const FrontmatterSchema = z
  .object({
    schema: z.string().min(1),
    agent: z
      .object({
        tenantId: z.string().min(1),
        agentId: z.string().min(1),
        name: z.string().min(1),
      })
      .passthrough(),
    meta: z.object({}).passthrough().optional(),
    tools: z
      .array(
        z
          .object({
            source: z.string().min(1), // "registry" | "core" | etc
            tenantId: z.string().optional(),
            names: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

function splitH1Sections(markdownBody: string): Array<{ title: string; body: string }> {
  const lines = markdownBody.split("\n");
  const sections: Array<{ title: string; body: string[] }> = [];

  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentTitle) {
      while (currentBody.length && currentBody[0].trim() === "") currentBody.shift();
      sections.push({ title: currentTitle, body: currentBody });
    }
    currentBody = [];
  };

  for (const line of lines) {
    const m = /^# (.+)\s*$/.exec(line);
    if (m) {
      flush();
      currentTitle = m[1].trim();
      continue;
    }
    currentBody.push(line);
  }
  flush();

  return sections.map((s) => ({ title: s.title, body: s.body.join("\n").trim() }));
}

// ---- Mongo fetch using your connection helper ----
async function fetchRegistryTools(params: { tenantId: string; toolNames: string[] }) {
  const { tenantId, toolNames } = params;
  if (!toolNames.length) return [];

  // Use your helper; we want strategic_machines / actions
  const { db } = await getMongoConnection(process.env.DB!, process.env.MAINDBNAME!);
  const actions = db.collection("actions");

  return await actions
    .find({ tenantId, name: { $in: toolNames } })
    .toArray();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const tenantId = req.nextUrl.searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    const tenant = await getTenantConfig(tenantId);
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Unknown tenant" }, { status: 404 });
    }

    const configs: AgentConfig[] = tenant.agentSettings ?? [];
    if (configs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No agentSettings configured for tenant" },
        { status: 404 }
      );
    }

    let cfg = configs.find((c) => c.agentId === agentId);
    if (!cfg && agentId === "default") cfg = configs[0];

    if (!cfg) {
      return NextResponse.json(
        { ok: false, error: `No agent config found for agentId "${agentId}"` },
        { status: 404 }
      );
    }

    const finalUrl = ensureMarkdownUrl(cfg.agentRepo.baseRawUrl);

    const upstream = await fetch(finalUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch markdown from ${finalUrl} (HTTP ${upstream.status})` },
        { status: 502 }
      );
    }

    const md = await upstream.text();

    // Parse frontmatter + body
    const parsed = matter(md);
    const frontmatterRaw = parsed.data;
    const body = parsed.content || "";

    // Validate required fields
    const fmResult = FrontmatterSchema.safeParse(frontmatterRaw);
    if (!fmResult.success) {
      const resp: Partial<AgentMdDocResponse> = {
        ok: false,
        error: "Invalid frontmatter (required fields missing/invalid).",
        validationErrors: fmResult.error.flatten(),
        md,
        frontmatter: frontmatterRaw as any,
        sections: splitH1Sections(body),
      };
      return NextResponse.json(resp, { status: 422 });
    }

    const frontmatter = fmResult.data;
    const sections = splitH1Sections(body);

    // Consistency checks against URL/query
    const specErrors: string[] = [];
    if (frontmatter.agent.tenantId !== tenantId) {
      specErrors.push(
        `Spec agent.tenantId (${frontmatter.agent.tenantId}) does not match requested tenantId (${tenantId}).`
      );
    }
    if (frontmatter.agent.agentId !== agentId && agentId !== "default") {
      specErrors.push(
        `Spec agent.agentId (${frontmatter.agent.agentId}) does not match requested agentId (${agentId}).`
      );
    }

    // ---- Resolve tools from frontmatter ----
    const toolEntries = frontmatter.tools ?? [];
    const registryEntry = toolEntries.find((t) => String(t.source) === "registry");
    const coreEntry = toolEntries.find((t) => String(t.source) === "core");

    const registryNames: string[] = (registryEntry?.names ?? []).filter(Boolean);
    const coreNames: string[] = (coreEntry?.names ?? []).filter(Boolean);

    // Fetch registry tools from Mongo
    const registryTools = await fetchRegistryTools({
      tenantId,
      toolNames: registryNames,
    });

    // Keep returned tools ordered exactly like the MD list
    const byName = new Map<string, any>(registryTools.map((t) => [t.name, t]));
    const orderedRegistryTools = registryNames.map((n) => byName.get(n)).filter(Boolean);

    // tools_errors: missing registry tools referenced in MD
    const tools_errors: string[] = [];
    for (const n of registryNames) {
      if (!byName.has(n)) tools_errors.push(`Registry tool not found in Mongo: ${n}`);
    }

    // If spec consistency failed, return 422 but still include parsed doc + tools
    if (specErrors.length > 0) {
      const resp: Partial<AgentMdDocResponse> = {
        ok: false,
        error: "Agent spec failed tenant/agentId consistency checks.",
        spec_errors: specErrors,
        md,
        frontmatter,
        sections,
        tools: orderedRegistryTools,
        core_tools: coreNames, // names only
        tools_errors,
      };
      return NextResponse.json(resp, { status: 422 });
    }

    const response: AgentMdDocResponse = {
      ok: true,
      md,
      frontmatter,
      sections,
      tools: orderedRegistryTools, // registry descriptors only
      core_tools: coreNames,        // core names only
      tools_errors: tools_errors.length ? tools_errors : [],
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[/api/agents/[agentId]] error:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
