
import { PromptDoc, StructuredPrompt } from "@/types/prompt";
import type { ToolDef } from "@/types/tools";

/** Minimal “tools section” builder for the prompt JSON */
export function makeToolUsageSection(toolDefs: ToolDef[]) {
  return {
    tools: toolDefs.map(t => ({
      name: t.name,
      description: t.description || t.name,
      parameters: t.parameters,
    })),
  };
}

function tryParseJson(s: string | undefined | null): any {
  if (!s || typeof s !== "string") return undefined;
  try { return JSON.parse(s); } catch { return undefined; }
}

/**
 * Accepts mixed prompt docs. Returns:
 *  - name: optional agent name (for display)
 *  - base: the STRUCTURED prompt object (without tools merged yet)
 */
export function selectPromptForTenant(
  tenantId: string,
  all: StructuredPrompt | StructuredPrompt[] | unknown
): { name?: string; base: StructuredPrompt } {
  // Recursively collect all StructuredPrompt-like objects
  const collected: StructuredPrompt[] = [];

  function collect(val: unknown) {
    if (!val) return;

    if (Array.isArray(val)) {
      for (const item of val) {
        collect(item);
      }
      return;
    }

    if (typeof val === "object") {
      const obj = val as any;
      // Heuristic: looks like a StructuredPrompt if it has agent.tenantId
      if (obj.agent && typeof obj.agent.tenantId === "string") {
        collected.push(obj as StructuredPrompt);
      }
      // for embedded prompts deeper inside other objects, recurse here.
    }
  }

  collect(all);

  if (collected.length === 0) {
    throw new Error("No prompts available");
  }

  // Normalize the incoming tenantId just in case
  const wanted = tenantId.trim();

  // 1) Exact tenant match
  const exact =
    collected.find(p => p?.agent?.tenantId === wanted) ?? null;

  // 2) Tenant "unknown"
  const unknown =
    collected.find(p => p?.agent?.tenantId === "unknown") ?? null;

  // 3) Fallback: first prompt
  const doc = exact || unknown || collected[0];

  // Debug (optional, useful while you validate)
  console.log("----inside of selectPromptForTenant----");
  console.log("tenantId:", wanted);
  console.log(
    "available tenantIds:",
    collected.map(p => p.agent?.tenantId)
  );
  console.log("chosen doc.tenantId:", doc.agent?.tenantId);

  return {
    name: doc.agent?.name,
    base: doc,
  };
}




/** Merge runtime tool schemas into the prompt and stringify for updateSession */
// prompts.ts
export function buildInstructions(base: StructuredPrompt, toolDefs: ToolDef[]): string {
  const toolsSection = {
    tools: toolDefs.map(t => ({
      name: t.name,
      description: t.description ?? t.name,
      parameters: t.parameters ?? { type: "object", properties: {} },
    })),
  };

  const merged = {
    ...base,
    capabilities: {
      ...(base.capabilities ?? {}),
      ...toolsSection,
    },
  };

  return JSON.stringify(merged);
}
