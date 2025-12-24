"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import TriggerIconButton from "./TriggerIconButton";
import { UserPlus } from "lucide-react";

import type {
  AdminTenantListResponse,
  AdminTenantItem,
  AgentListResponse,
  AgentListItem,
} from "@/types/prompt-md";

async function fetchJsonOrThrow<T>(url: string, parseLabel: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text && text.trim().startsWith("<")
        ? `Server returned HTML error (status ${res.status})`
        : text || `HTTP ${res.status}`
    );
  }
  try {
    return (await res.json()) as T;
  } catch (e: any) {
    throw new Error(`Failed to parse ${parseLabel} as JSON: ${e?.message || String(e)}`);
  }
}

type Variant = "neutral" | "success" | "danger" | "warning";

export type AgentSelection = {
  tenantId: string;
  tenantName: string;
  agentId: string;
  agentName: string;
};

type Props = {
  value?: Partial<AgentSelection>;
  onChange: (next: AgentSelection) => void;
  defaultTenantId?: string;
  title?: string;
  status?: { warnings?: string[]; errors?: string[] };
  variant?: Variant;
};

export default function AgentDialogTrigger({
  value,
  onChange,
  defaultTenantId,
  title = "Select Agent",
  status,
  variant = "neutral",
}: Props) {
  const [open, setOpen] = React.useState(false);

  const [tenants, setTenants] = React.useState<AdminTenantItem[]>([]);
  const [agents, setAgents] = React.useState<AgentListItem[]>([]);

  const [loadingTenants, setLoadingTenants] = React.useState(false);
  const [loadingAgents, setLoadingAgents] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);

  const [tenantId, setTenantId] = React.useState<string>(value?.tenantId || defaultTenantId || "");
  const [agentId, setAgentId] = React.useState<string>(value?.agentId || "");

  const runtimeErrors = status?.errors ?? [];
  const runtimeWarnings = status?.warnings ?? [];

  // keep local state in sync if parent changes selection externally
  React.useEffect(() => {
    if (value?.tenantId && value.tenantId !== tenantId) setTenantId(value.tenantId);
    if (value?.agentId && value.agentId !== agentId) setAgentId(value.agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.tenantId, value?.agentId]);

  // load tenants when dialog opens
  React.useEffect(() => {
    if (!open) return;

    (async () => {
      setLoadingTenants(true);
      setError(null);
      try {
        const json = await fetchJsonOrThrow<AdminTenantListResponse>("/api/agents/tenants", "tenants");
        if (!json.ok) throw new Error(json.error || "Tenants response not ok.");
        const list = json.tenants || [];
        setTenants(list);

        const initial =
          tenantId ||
          (defaultTenantId && list.find((t) => t.tenantId === defaultTenantId)?.tenantId) ||
          list[0]?.tenantId ||
          "";

        setTenantId(initial);
      } catch (e: any) {
        setError(e?.message || "Failed to load tenants.");
        setTenants([]);
      } finally {
        setLoadingTenants(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // load agents when tenant changes (and dialog is open)
  React.useEffect(() => {
    if (!open) return;
    if (!tenantId) {
      setAgents([]);
      setAgentId("");
      return;
    }

    (async () => {
      setLoadingAgents(true);
      setError(null);
      try {
        const json = await fetchJsonOrThrow<AgentListResponse>(
          `/api/agents?tenantId=${encodeURIComponent(tenantId)}`,
          "agents"
        );
        if (!json.ok) throw new Error(json.error || "Agent list not ok.");
        const list = json.agents || [];
        setAgents(list);

        const stillValid = list.some((a) => a.agentId === agentId);
        const nextAgentId = stillValid ? agentId : (list[0]?.agentId || "");
        setAgentId(nextAgentId);
      } catch (e: any) {
        setError(e?.message || "Failed to load agents.");
        setAgents([]);
        setAgentId("");
      } finally {
        setLoadingAgents(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  const selectedTenant = tenants.find((t) => t.tenantId === tenantId);
  const selectedAgent = agents.find((a) => a.agentId === agentId);

  const tenantName = selectedTenant?.name || tenantId || "Unknown tenant";
  const agentName = selectedAgent?.name || agentId || "Unknown agent";

  const canApply = Boolean(tenantId) && Boolean(agentId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TriggerIconButton title={title} variant={variant}>
          <UserPlus size={14} />
        </TriggerIconButton>
      </DialogTrigger>

      <DialogContent className="bg-neutral-900 text-neutral-200 border border-neutral-800 max-w-[90vw] w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {(runtimeErrors.length > 0 || runtimeWarnings.length > 0) && (
          <div className="space-y-2">
            {runtimeErrors.length > 0 && (
              <div className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-100">
                <div className="font-semibold mb-1">Spec errors ({runtimeErrors.length})</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {runtimeErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {runtimeWarnings.length > 0 && (
              <div className="rounded-md border border-amber-700 bg-amber-900/20 px-3 py-2 text-xs text-amber-100">
                <div className="font-semibold mb-1">Spec warnings ({runtimeWarnings.length})</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {runtimeWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-[11px] text-neutral-400">
              For full details (frontmatter + tool descriptors + section rendering), check the Admin Spec page.
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        <div className="mt-2 space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-neutral-400">Tenant</div>
            <select
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value || "");
                setAgentId("");
              }}
              disabled={loadingTenants}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            >
              {loadingTenants ? (
                <option value="">Loading tenants…</option>
              ) : tenants.length === 0 ? (
                <option value="">No tenants found</option>
              ) : (
                tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.tenantId} — {t.name} [{t.status}]
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-neutral-400">Agent</div>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value || "")}
              disabled={!tenantId || loadingAgents}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            >
              {!tenantId ? (
                <option value="">Select a tenant first</option>
              ) : loadingAgents ? (
                <option value="">Loading agents…</option>
              ) : agents.length === 0 ? (
                <option value="">No agents found</option>
              ) : (
                agents.map((a) => (
                  <option key={a.agentId} value={a.agentId}>
                    {a.name || a.agentId}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-neutral-400">
              Applying: <span className="text-neutral-200">{tenantName}</span>{" "}
              <span className="text-neutral-500">/</span>{" "}
              <span className="text-neutral-200">{agentName}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canApply}
                onClick={() => {
                  if (!tenantId || !agentId) return;
                  onChange({ tenantId, tenantName, agentId, agentName });
                  setOpen(false);
                }}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
