// lib/agent/agentMd.ts
import yaml from "js-yaml";
import type { StructuredPrompt } from "@/types/prompt";
import { ToolRegistryArraySchema, type ToolRegistryItem } from "@/types/toolRegistry.schema"; 

type AgentMdFrontmatter = {
  agent: {
    tenantId: string;
    agentId?: string;
    name?: string;
    tone?: string;
    start?: string;
    fetch_current_date?: string;
    [k: string]: any;
  };
  meta?: Record<string, any>;
  tools?: Record<string, any>;
};

type Sections = Record<string, string>;

function splitFrontmatter(
  markdown: string
): { frontmatter?: AgentMdFrontmatter; body: string } {
  const fmMatch = /^---\n([\s\S]+?)\n---\n?([\s\S]*)$/m.exec(markdown);
  if (!fmMatch) return { body: markdown };

  const [, fmRaw, body] = fmMatch;
  const frontmatter = yaml.load(fmRaw) as AgentMdFrontmatter;
  return { frontmatter, body };
}

function splitSections(body: string): Sections {
  const lines = body.split(/\r?\n/);
  const sections: Sections = {};
  let currentKey: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentKey) {
      sections[currentKey] = buffer.join("\n").trim();
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) {
      flush();
      currentKey = m[1].trim().toLowerCase(); // e.g. "style rules", "tools"
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function extractBulletList(md: string | undefined): string[] {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const m = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function extractFirstJsonBlock(md: string | undefined): any | null {
  if (!md) return null;
  const match = /```json\s*([\s\S]+?)```/i.exec(md);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function parseAgentMarkdown(
  markdown: string
): Promise<StructuredPrompt> {
  const { frontmatter, body } = splitFrontmatter(markdown);
  if (!frontmatter?.agent?.tenantId) {
    throw new Error("agent.tenantId is required in frontmatter");
  }

  const sections = splitSections(body);

  const styleRules = extractBulletList(sections["style rules"]);
  const agentPoliciesRaw = sections["agent policies"] ?? "";
  const policyRaw = sections["policy"] ?? "";
  const responseTemplates =
    extractFirstJsonBlock(sections["response templates"]) || {};
  const examples = extractFirstJsonBlock(sections["examples"]) || [];

  // 🔽 NEW: parse Tools section
  const toolsSection = sections["tools"];
  let tools: ToolRegistryItem[] | undefined = undefined;
  const toolsErrors: string[] = [];

  if (toolsSection) {
    const rawJson = extractFirstJsonBlock(toolsSection);
    if (!rawJson) {
      toolsErrors.push(
        "TOOLS section found but no ```json ... ``` block could be parsed."
      );
    } else {
      try {
        const parsed = ToolRegistryArraySchema.parse(rawJson);
        tools = parsed;
      } catch (err: any) {
        toolsErrors.push(
          `Tool JSON failed validation: ${
            err?.message || String(err)
          }`
        );
      }
    }
  }

  // Avoid TypeScript “duplicate key” warning by only merging *extra* keys
  const CORE_AGENT_KEYS = new Set([
    "tenantId",
    "agentId",
    "name",
    "tone",
    "start",
    "fetch_current_date",
  ]);

  const extraAgentKeys: Record<string, any> = {};
  for (const [k, v] of Object.entries(frontmatter.agent)) {
    if (!CORE_AGENT_KEYS.has(k)) {
      extraAgentKeys[k] = v;
    }
  }

  const structured: StructuredPrompt = {
    agent: {
      tenantId: frontmatter.agent.tenantId,
      agentId: frontmatter.agent.agentId,
      name: frontmatter.agent.name,
      tone: frontmatter.agent.tone,
      start: frontmatter.agent.start,
      fetch_current_date: frontmatter.agent.fetch_current_date,
      ...extraAgentKeys,
    },
    style_rules: styleRules,
    agent_policies: {
      raw: agentPoliciesRaw,
    },
    policy: {
      raw: policyRaw,
    },
    dialog_flow: sections["dialog flow"] ?? "",
    response_templates: responseTemplates,
    examples,
  };

  // Attach tools + errors if present
  if (tools && tools.length > 0) {
    (structured as any).tools = tools;
  }
  if (toolsErrors.length > 0) {
    (structured as any).tools_errors = toolsErrors;
  }

  return structured;
}