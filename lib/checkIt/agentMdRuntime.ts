import { fetchJsonAllowErrors } from "./fetchJson";

export type AgentRuntimeLoadResult = {
  ok: boolean;
  tenantId: string;
  agentId: string;
  agentName: string;
  instructions: string;
  toolNames: string[];
  warnings: string[];
  errors: string[];
};

export async function loadAgentMdRuntime(args: {
  tenantId: string;
  agentId: string;
}): Promise<AgentRuntimeLoadResult> {
  const { tenantId, agentId } = args;

  // Always return a consistent shape (even for missing args)
  if (!tenantId || !agentId) {
    const errors = [
      !tenantId ? "Missing tenantId" : null,
      !agentId ? "Missing agentId" : null,
    ].filter(Boolean) as string[];

    return {
      ok: false,
      tenantId,
      agentId,
      agentName: agentId || "Unknown agent",
      instructions: "",
      toolNames: [],
      warnings: [],
      errors,
    };
  }

  // ✅ your endpoint location
  const url =
    `/api/agents/runtime?tenantId=${encodeURIComponent(tenantId)}&agentId=${encodeURIComponent(agentId)}`;

  // This endpoint returns the runtime shape already
  const json = await fetchJsonAllowErrors<AgentRuntimeLoadResult>(url, "runtime agent");

  // Guardrails: ensure arrays exist
  return {
    ok: Boolean(json.ok),
    tenantId: json.tenantId ?? tenantId,
    agentId: json.agentId ?? agentId,
    agentName: json.agentName ?? agentId,
    instructions: json.instructions ?? "",
    toolNames: Array.isArray(json.toolNames) ? json.toolNames : [],
    warnings: Array.isArray(json.warnings) ? json.warnings : [],
    errors: Array.isArray(json.errors) ? json.errors : [],
  };
}
