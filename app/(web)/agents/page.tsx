"use client";

import * as React from "react";
import { useTenant } from "@/context/tenant-context";
import type { StructuredPrompt } from "@/types/prompt";

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
  agent: StructuredPrompt;
  error?: string;
};

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
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-200">
      {children}
    </span>
  );
}

export default function AgentsAdminPage() {
  const { tenantId } = useTenant();
  const [loadingList, setLoadingList] = React.useState(true);
  const [loadingAgent, setLoadingAgent] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [agentError, setAgentError] = React.useState<string | null>(null);

  const [agents, setAgents] = React.useState<AgentListItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(
    null
  );
  const [agent, setAgent] = React.useState<StructuredPrompt | null>(null);

  // Fetch list of agents for this tenant
  React.useEffect(() => {
    if (!tenantId) return;

    (async () => {
      setLoadingList(true);
      setListError(null);
      try {
        const res = await fetch(`/api/agents?tenantId=${encodeURIComponent(tenantId)}`);
        const json: AgentListResponse = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setAgents(json.agents || []);
        if (json.agents.length > 0) {
          setSelectedAgentId(json.agents[0].agentId);
        }
      } catch (e: any) {
        setListError(e?.message || "Failed to load agents.");
      } finally {
        setLoadingList(false);
      }
    })();
  }, [tenantId]);

  // Fetch selected agent details
  React.useEffect(() => {
    if (!tenantId || !selectedAgentId) {
      setAgent(null);
      return;
    }

    (async () => {
      setLoadingAgent(true);
      setAgentError(null);
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(selectedAgentId)}?tenantId=${encodeURIComponent(
            tenantId
          )}`
        );
        const json: AgentDetailResponse = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setAgent(json.agent);
      } catch (e: any) {
        setAgentError(e?.message || "Failed to load agent spec.");
        setAgent(null);
      } finally {
        setLoadingAgent(false);
      }
    })();
  }, [tenantId, selectedAgentId]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAgentId(e.target.value || null);
  };

  const selectedMeta = React.useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((a) => a.agentId === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const agentName =
    agent?.agent?.name || selectedMeta?.name || selectedAgentId || "Unknown agent";

  return (
    <div className="mx-auto max-w-6xl p-4 xs:p-6 text-neutral-50">
      {/* Header (nav bar should already come from your layout) */}
      <header className="mb-4 xs:mb-6 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-3">
            Agent Specs
            {selectedMeta?.filename && (
              <span className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">
                {selectedMeta.filename}
              </span>
            )}
          </h1>
          <p className="text-sm text-neutral-500">
            Tenant:{" "}
            <span className="font-medium text-neutral-200">{tenantId}</span>
          </p>
        </div>

        {/* Agent selector */}
        <div className="flex flex-col items-stretch gap-2 xs:flex-row xs:items-center">
          {loadingList ? (
            <span className="text-xs text-neutral-500">Loading agents…</span>
          ) : listError ? (
            <span className="rounded-md border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs text-red-200">
              {listError}
            </span>
          ) : (
            <select
              value={selectedAgentId ?? ""}
              onChange={handleSelectChange}
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

      {/* Main content */}
      {agentError && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/40 p-4 text-sm text-red-100">
          {agentError}
        </div>
      )}

      {loadingAgent ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          Loading agent spec…
        </div>
      ) : !agent ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400">
          {listError
            ? "Unable to load agents."
            : "Select an agent to view its spec."}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <Badge>agentId: {selectedAgentId}</Badge>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Greeting / Start">
              <div className="text-xs leading-relaxed text-neutral-200 whitespace-pre-line">
                {agent.agent.start || "—"}
              </div>
            </SectionCard>

            <SectionCard title="Date Handling">
              <div className="space-y-2 text-xs">
                <div className="text-neutral-200 whitespace-pre-line">
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

          {/* Style + Policies */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                <span className="text-xs text-neutral-500">No style rules.</span>
              )}
            </SectionCard>

            <SectionCard title="Agent Policies (raw)">
              {agent.agent_policies && "raw" in agent.agent_policies ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {(agent.agent_policies as any).raw || "—"}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">No agent policies.</span>
              )}
            </SectionCard>
          </div>

          {/* Dialog Flow + Policy raw */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SectionCard title="Dialog Flow">
              {agent.dialog_flow ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {typeof agent.dialog_flow === "string"
                    ? agent.dialog_flow
                    : JSON.stringify(agent.dialog_flow, null, 2)}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">No dialog flow.</span>
              )}
            </SectionCard>

            <SectionCard title="Policy (raw)">
              {agent.policy && "raw" in agent.policy ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[11px] text-neutral-200">
                  {(agent.policy as any).raw || "—"}
                </pre>
              ) : (
                <span className="text-xs text-neutral-500">No policy section.</span>
              )}
            </SectionCard>
          </div>

          {/* Response templates + examples */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                <span className="text-xs text-neutral-500">No examples.</span>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
