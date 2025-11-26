// lib/agent/agentMd.ts
import yaml from "js-yaml";
import type { StructuredPrompt } from "@/types/prompt";

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

function splitFrontmatter(markdown: string): { frontmatter?: AgentMdFrontmatter; body: string } {
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
      currentKey = m[1].trim().toLowerCase(); // e.g. "style rules"
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

export async function parseAgentMarkdown(markdown: string): Promise<StructuredPrompt> {
  const { frontmatter, body } = splitFrontmatter(markdown);
  if (!frontmatter?.agent?.tenantId) {
    throw new Error("agent.tenantId is required in frontmatter");
  }

  const sections = splitSections(body);

  const styleRules = extractBulletList(sections["style rules"]);

  // You can organize sub-sections in many ways; here we treat the big sections
  // "Agent Policies", "Policy" etc as raw markdown and/or simple bullet lists.
  const agentPoliciesRaw = sections["agent policies"] ?? "";
  const policyRaw = sections["policy"] ?? "";

  const responseTemplates = extractFirstJsonBlock(sections["response templates"]) || {};
  const examples = extractFirstJsonBlock(sections["examples"]) || [];

const structured: StructuredPrompt = {
  agent: {
    ...frontmatter.agent, // spread FIRST

    // override or enforce required fields
    tenantId: frontmatter.agent.tenantId,
    name: frontmatter.agent.name,
    tone: frontmatter.agent.tone,
    start: frontmatter.agent.start,
    fetch_current_date: frontmatter.agent.fetch_current_date,
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

return structured;
}
