// app/(web)/agents/page.tsx
"use client";

import * as React from "react";
import { useTenant } from "@/context/tenant-context";
import type { StructuredPrompt } from "@/types/prompt";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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

type AgentDetailResponse = {
  ok: boolean;
  agent: StructuredPrompt & {
    tools?: any[];
    tools_errors?: string[];
  };
  error?: string;
};

type AdminTenantItem = {
  tenantId: string;
  name: string;
  status: string;
};

type AdminTenantListResponse = {
  ok: boolean;
  tenants: AdminTenantItem[];
  error?: string;
};

type AgentWithTools = StructuredPrompt & {
  tools?: any[];
  tools_errors?: string[];
};


function JsonPretty({ value }: { value: any }) {
  return (
    <SyntaxHighlighter
      language="json"
      style={vscDarkPlus}
      customStyle={{
        background: "#020617",          // tailwind-ish: bg-slate-950
        borderRadius: 8,
        padding: 12,
        fontSize: 11,
        maxHeight: "20rem",
        overflow: "auto",
        margin: 0,
      }}
      wrapLongLines
    >
      {JSON.stringify(value, null, 2)}
    </SyntaxHighlighter>
  );
}



function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
      <h2 className="mb-2 text-sm font-semibold text-neutral-200">{title}</h2>
      <div className="text-sm text-neutral-200">{children}</div>
    </section>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "error" | "warn" | "muted";
}) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  const toneClasses =
    tone === "ok"
      ? "bg-emerald-900/60 text-emerald-200 border border-emerald-700"
      : tone === "error"
      ? "bg-red-900/60 text-red-100 border border-red-700"
      : tone === "warn"
      ? "bg-amber-900/60 text-amber-100 border border-amber-700"
      : tone === "muted"
      ? "bg-neutral-800 text-neutral-400 border border-neutral-700"
      : "bg-neutral-800 text-neutral-200 border border-neutral-700";

  return <span className={`${base} ${toneClasses}`}>{children}</span>;
}

export default function AgentsAdminPage() {
  const { tenantId: contextTenantId } = useTenant();

  // Admin tenant selection
  const [tenants, setTenants] = React.useState<AdminTenantItem[]>([]);
  const [tenantsLoading, setTenantsLoading] = React.useState(true);
  const [tenantsError, setTenantsError] = React.useState<string | null>(null);

  // Selected tenant (admin can change); default = contextTenantId
  const [selectedTenantId, setSelectedTenantId] = React.useState<string | null>(
    null
  );

  // Agents for selected tenant
  const [loadingList, setLoadingList] = React.useState(true);
  const [loadingAgent, setLoadingAgent] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [agentError, setAgentError] = React.useState<string | null>(null);

  const [agents, setAgents] = React.useState<AgentListItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(
    null
  );
  const [agent, setAgent] = React.useState<AgentWithTools | null>(null);

  // NEW: selected tool name within the current agent
  const [selectedToolName, setSelectedToolName] = React.useState<string | null>(
    null
  );

  // Load all tenants (admin view)
  React.useEffect(() => {
    (async () => {
      setTenantsLoading(true);
      setTenantsError(null);
      try {
        const res = await fetch("/api/agents/tenants");
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text && text.trim().startsWith("<")
              ? `Server returned HTML error (status ${res.status})`
              : text || `HTTP ${res.status}`
          );
        }
        let json: AdminTenantListResponse;
        try {
          json = (await res.json()) as AdminTenantListResponse;
        } catch (parseErr: any) {
          throw new Error(
            `Failed to parse tenants response as JSON: ${
              parseErr?.message || String(parseErr)
            }`
          );
        }
        if (!json.ok) {
          throw new Error(json.error || "Tenants response not ok.");
        }
        setTenants(json.tenants || []);
        // Default selection: context tenantId if present in list; else first
        const contextInList = json.tenants.find(
          (t) => t.tenantId === contextTenantId
        );
        if (contextInList) {
          setSelectedTenantId(contextInList.tenantId);
        } else if (json.tenants.length > 0) {
          setSelectedTenantId(json.tenants[0].tenantId);
        } else {
          setSelectedTenantId(null);
        }
      } catch (e: any) {
        setTenantsError(e?.message || "Failed to load tenant list.");
        setTenants([]);
        setSelectedTenantId(null);
      } finally {
        setTenantsLoading(false);
      }
    })();
  }, [contextTenantId]);

  const effectiveTenantId = selectedTenantId ?? contextTenantId ?? "";

  // Fetch list of agents for the selected tenant
  React.useEffect(() => {
    if (!effectiveTenantId) {
      setAgents([]);
      setSelectedAgentId(null);
      return;
    }

    (async () => {
      setLoadingList(true);
      setListError(null);
      try {
        const res = await fetch(
          `/api/agents?tenantId=${encodeURIComponent(effectiveTenantId)}`
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text && text.trim().startsWith("<")
              ? `Server returned HTML error (status ${res.status})`
              : text || `HTTP ${res.status}`
          );
        }

        let raw: any;
        try {
          raw = await res.json();
        } catch (parseErr: any) {
          throw new Error(
            `Failed to parse /api/agents response as JSON: ${
              parseErr?.message || String(parseErr)
            }`
          );
        }

        const ok = Boolean(raw?.ok);
        const agentsArray: AgentListItem[] = Array.isArray(raw?.agents)
          ? raw.agents
          : [];

        if (!ok) {
          throw new Error(raw?.error || "Agent list not ok.");
        }

        setAgents(agentsArray);

        if (agentsArray.length > 0) {
          setSelectedAgentId(agentsArray[0].agentId);
        } else {
          setSelectedAgentId(null);
        }
      } catch (e: any) {
        setListError(e?.message || "Failed to load agents.");
        setAgents([]);
        setSelectedAgentId(null);
      } finally {
        setLoadingList(false);
      }
    })();
  }, [effectiveTenantId]);

  // Fetch selected agent for selected tenant
  React.useEffect(() => {
    if (!effectiveTenantId || !selectedAgentId) {
      setAgent(null);
      setSelectedToolName(null);
      return;
    }

    (async () => {
      setLoadingAgent(true);
      setAgentError(null);
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(
            selectedAgentId
          )}?tenantId=${encodeURIComponent(effectiveTenantId)}`
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text && text.trim().startsWith("<")
              ? `Server returned HTML error (status ${res.status})`
              : text || `HTTP ${res.status}`
          );
        }

        let json: AgentDetailResponse;
        try {
          json = (await res.json()) as AgentDetailResponse;
        } catch (parseErr: any) {
          throw new Error(
            `Failed to parse agent detail as JSON: ${
              parseErr?.message || String(parseErr)
            }`
          );
        }

        if (!json.ok) {
          throw new Error(json.error || "Agent detail not ok.");
        }

        const agentData = json.agent as AgentWithTools;
        setAgent(agentData);

        // Initialize selected tool to first tool, if any
        if (agentData.tools && agentData.tools.length > 0) {
          const first = agentData.tools[0];
          if (first && typeof first.name === "string") {
            setSelectedToolName(first.name);
          } else {
            setSelectedToolName(null);
          }
        } else {
          setSelectedToolName(null);
        }
      } catch (e: any) {
        setAgentError(e?.message || "Failed to load agent spec.");
        setAgent(null);
        setSelectedToolName(null);
      } finally {
        setLoadingAgent(false);
      }
    })();
  }, [effectiveTenantId, selectedAgentId]);

  const handleAgentSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAgentId(e.target.value || null);
  };

  const handleTenantSelectChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value || "";
    setSelectedTenantId(value || null);
  };

  const selectedTenantMeta = React.useMemo(() => {
    if (!effectiveTenantId) return null;
    return tenants.find((t) => t.tenantId === effectiveTenantId) || null;
  }, [tenants, effectiveTenantId]);

  const selectedAgentMeta = React.useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((a) => a.agentId === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const agentName =
    agent?.agent?.name ||
    selectedAgentMeta?.name ||
    selectedAgentId ||
    "Unknown agent";

  // Derive tools + active tool
  const tools = agent?.tools ?? [];
  const activeTool =
    tools.find(
      (t: any) => t && typeof t.name === "string" && t.name === selectedToolName
    ) || tools[0];

  return (
    <div className="mx-auto max-w-6xl p-4 xs:p-6 text-neutral-50">
      {/* Header (nav bar comes from layout) */}
      <header className="mb-4 xs:mb-6 flex flex-col gap-3 xs:flex-row xs:items-center xs:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-semibold">
            Agent Specs
            {selectedAgentMeta?.filename && (
              <span className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">
                {selectedAgentMeta.filename}
              </span>
            )}
          </h1>
          <p className="text-sm text-neutral-500">
            Viewing tenant:{" "}
            <span className="font-medium text-neutral-200">
              {selectedTenantMeta
                ? `${selectedTenantMeta.tenantId} (${selectedTenantMeta.name})`
                : effectiveTenantId || "—"}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 xs:flex-row xs:items-center">
          {/* Tenant selector (admin) */}
          {tenantsLoading ? (
            <span className="text-xs text-neutral-500">Loading tenants…</span>
          ) : tenantsError ? (
            <span className="rounded-md border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs text-red-100">
              {tenantsError}
            </span>
          ) : (
            <select
              value={effectiveTenantId}
              onChange={handleTenantSelectChange}
              className="min-w-[220px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {tenants.length === 0 && (
                <option value="">No tenants found</option>
              )}
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.tenantId} — {t.name} [{t.status}]
                </option>
              ))}
            </select>
          )}

          {/* Agent selector */}
          {loadingList ? (
            <span className="text-xs text-neutral-500">Loading agents…</span>
          ) : listError ? (
            <span className="rounded-md border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs text-red-100">
              {listError}
            </span>
          ) : (
            <select
              value={selectedAgentId ?? ""}
              onChange={handleAgentSelectChange}
              className="min-w-[220px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {agents.length === 0 && (
                <option value="">No agents found</option>
              )}
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.name || a.agentId}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Errors */}
      {agentError && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/40 p-4 text-sm text-red-100">
          {agentError}
        </div>
      )}

      {/* Main content */}
      {loadingAgent ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          Loading agent spec…
        </div>
      ) : !agent ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400">
          {listError
            ? "Unable to load agents."
            : "Select a tenant and agent to view its spec."}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top summary row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SectionCard title="Agent">
              <div className="space-y-1">
                <div className="text-base font-semibold text-neutral-50">
                  {agentName}
                </div>
                <div className="text-xs text-neutral-500">
                  tenantId:{" "}
                  <span className="font-mono text-neutral-300">
                    {agent.agent.tenantId}
                  </span>
                </div>
                {agent.agent.tone && (
                  <div className="text-xs text-neutral-400">
                    tone:{" "}
                    <span className="font-mono text-neutral-200">
                      {agent.agent.tone}
                    </span>
                  </div>
                )}
                {selectedAgentId && (
                  <div className="mt-1">
                    <Badge tone="muted">agentId: {selectedAgentId}</Badge>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Greeting / Start">
              <div className="whitespace-pre-line text-xs leading-relaxed text-neutral-200">
                {agent.agent.start || "—"}
              </div>
            </SectionCard>

            <SectionCard title="Date Handling">
              <div className="space-y-2 text-xs">
                <div className="whitespace-pre-line text-neutral-200">
                  {agent.agent.fetch_current_date || "—"}
                </div>
                {agent.policy && "raw" in agent.policy && (
                  <div className="mt-2 border-t border-neutral-800 pt-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      Policy: Date Rules (excerpt)
                    </div>
                    <pre className="max-h-24 overflow-auto rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-300">
                      {(agent.policy as any).raw
                        ?.split("\n")
                        .filter((l: string) =>
                          l.toLowerCase().includes("date")
                        )
                        .slice(0, 4)
                        .join("\n") || "—"}
                    </pre>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Style + Agent policies */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SectionCard title="Style Rules">
              {agent.style_rules && agent.style_rules.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {agent.style_rules.map((rule: any, idx: any) => (
                    <li key={idx} className="text-neutral-200">
                      {rule}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-neutral-500">
                  No style rules.
                </span>
              )}
            </SectionCard>

            <SectionCard title="Agent Policies (raw)">
              {agent.agent_policies && "raw" in agent.agent_policies ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {(agent.agent_policies as any).raw || "—"}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">
                  No agent policies.
                </span>
              )}
            </SectionCard>
          </div>

          {/* Dialog flow + Policy */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SectionCard title="Dialog Flow">
              {agent.dialog_flow ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {typeof agent.dialog_flow === "string"
                    ? agent.dialog_flow
                    : JSON.stringify(agent.dialog_flow, null, 2)}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">
                  No dialog flow.
                </span>
              )}
            </SectionCard>

            <SectionCard title="Policy (raw)">
              {agent.policy && "raw" in agent.policy ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {(agent.policy as any).raw || "—"}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">
                  No policy section.
                </span>
              )}
            </SectionCard>
          </div>

          {/* Tools inspector */}
          <SectionCard title="Tools">
            {agent.tools_errors && agent.tools_errors.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-600 bg-amber-900/30 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-100">
                    Tool validation issues
                  </span>
                  <Badge tone="warn">
                    {agent.tools_errors.length} issue
                    {agent.tools_errors.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <ul className="space-y-1 text-[11px] text-amber-100">
                  {agent.tools_errors.map((err, idx) => (
                    <li key={idx} className="font-mono">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tools.length === 0 ? (
              <div className="text-xs text-neutral-500">
                No tools defined for this agent.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary strip */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="ok">{tools.length} tool(s)</Badge>
                  {activeTool?.kind && (
                    <Badge tone="muted">kind: {activeTool.kind}</Badge>
                  )}
                  {typeof activeTool?.enabled === "boolean" && (
                    <Badge tone={activeTool.enabled ? "ok" : "muted"}>
                      {activeTool.enabled ? "enabled" : "disabled"}
                    </Badge>
                  )}
                  {typeof activeTool?.priority === "number" && (
                    <Badge tone="muted">
                      priority: {activeTool.priority}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  {/* Tool selector list */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Tools
                      </span>
                    </div>
                    <select
                      value={selectedToolName ?? (activeTool?.name ?? "")}
                      onChange={(e) =>
                        setSelectedToolName(
                          e.target.value ? e.target.value : null
                        )
                      }
                      className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {tools.map((t: any) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    <div className="space-y-1 max-h-56 overflow-auto pr-1">
                      {tools.map((t: any) => {
                        const isActive =
                          activeTool && t.name === activeTool.name;
                        return (
                          <button
                            key={t.name}
                            type="button"
                            onClick={() => setSelectedToolName(t.name)}
                            className={`flex w-full flex-col rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                              isActive
                                ? "border-blue-500 bg-blue-950/40 text-neutral-50"
                                : "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-600"
                            }`}
                          >
                            <span className="font-mono text-[11px]">
                              {t.name}
                            </span>
                            {t.description && (
                              <span className="mt-0.5 line-clamp-2 text-[11px] text-neutral-400">
                                {t.description}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active tool detail */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                    {activeTool ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-sm text-neutral-50">
                              {activeTool.name}
                            </div>
                            {activeTool.description && (
                              <div className="mt-0.5 text-xs text-neutral-400">
                                {activeTool.description}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {activeTool.http?.method && (
                              <Badge tone="muted">
                                {activeTool.http.method}
                              </Badge>
                            )}
                            {activeTool.version != null && (
                              <Badge tone="muted">
                                v{String(activeTool.version)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {activeTool.http?.urlTemplate && (
                          <div className="rounded-md bg-neutral-900/80 px-2 py-1.5 text-[11px] text-neutral-300">
                            <span className="font-semibold text-neutral-400">
                              URL:
                            </span>{" "}
                            <span className="font-mono">
                              {activeTool.http.urlTemplate}
                            </span>
                          </div>
                        )}

                        <div className="text-[11px] text-neutral-400">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            Descriptor JSON
                          </div>
                          <JsonPretty value={activeTool} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-500">
                        Select a tool to inspect its configuration.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Response templates + examples */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SectionCard title="Response Templates (JSON)">
              {agent.response_templates &&
              Object.keys(agent.response_templates).length > 0 ? (
                <pre className="max-h-64 overflow-auto rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {JSON.stringify(agent.response_templates, null, 2)}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">
                  No response templates.
                </span>
              )}
            </SectionCard>

            <SectionCard title="Examples (JSON)">
              {agent.examples && agent.examples.length > 0 ? (
                <pre className="max-h-64 overflow-auto rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {JSON.stringify(agent.examples, null, 2)}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">
                  No examples.
                </span>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
