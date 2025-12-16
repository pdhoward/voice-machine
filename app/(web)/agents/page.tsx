"use client";

import * as React from "react";
import { useTenant } from "@/context/tenant-context";
import {
  AgentListResponse,
  AgentMdDocResponse,
  AdminTenantListResponse,
  AdminTenantItem,
  AgentListItem,
} from "@/types/prompt-md";

import ReactMarkdown from "react-markdown";
import remarkDirective from "remark-directive";
import { remarkAdmonitions } from "@/lib/markdown/remark-admonitions";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

type HighlighterTheme = Record<string, React.CSSProperties>;

function normalizeThemeStyle(theme: unknown): HighlighterTheme {
  if (theme && typeof theme === "object" && !Array.isArray(theme)) {
    const obj = theme as Record<string, unknown>;
    const looksLikeCssProps =
      "background" in obj || "backgroundColor" in obj || "color" in obj || "fontSize" in obj;
    if (looksLikeCssProps) return { pre: obj as React.CSSProperties };
    return obj as HighlighterTheme;
  }
  return {};
}


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

  let json: any;
  try {
    json = await res.json();
  } catch (parseErr: any) {
    throw new Error(
      `Failed to parse ${parseLabel} response as JSON: ${
        parseErr?.message || String(parseErr)
      }`
    );
  }

  return json as T;
}

async function fetchJsonAllowErrors<T>(url: string, parseLabel: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text().catch(() => "");

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  // return JSON even if !ok (so UI can render spec_errors/tools_errors/etc)
  if (json) return json as T;

  // if it wasn't JSON, fall back to throwing like your original helper
  throw new Error(
    text && text.trim().startsWith("<")
      ? `Server returned HTML error (status ${res.status})`
      : text || `HTTP ${res.status}`
  );
}


function Admonition({
  kind,
  children,
}: {
  kind?: string;
  children: React.ReactNode;
}) {
  const k = (kind || "note").toLowerCase();
  const title =
    k === "tip" ? "Tip" :
    k === "warning" ? "Warning" :
    k === "danger" ? "Danger" :
    k === "info" ? "Info" : "Note";

  const tone =
    k === "warning" ? "border-amber-700 bg-amber-950/30 text-amber-100" :
    k === "danger" ? "border-red-700 bg-red-950/30 text-red-100" :
    k === "tip" ? "border-emerald-700 bg-emerald-950/25 text-emerald-100" :
    k === "info" ? "border-blue-700 bg-blue-950/25 text-blue-100" :
    "border-neutral-700 bg-neutral-950/25 text-neutral-100";

  return (
    <div className={`my-3 rounded-lg border p-3 ${tone}`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-90">
        {title}
      </div>
      <div className="text-sm">{children}</div>
    </div>
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

// Markdown renderer (code fences w/ SyntaxHighlighter)
async function MarkdownBlock({ markdown }: { markdown: string }) {
  const components: Components = {
    code({ className, children }) {
      const raw = String(children ?? "");
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1];
      const isInline = !lang && !raw.includes("\n");

      if (isInline) {
        return (
          <code className="rounded bg-neutral-950/60 px-1 py-0.5 text-[12px]">
            {children}
          </code>
        );
      }

      return (
        <SyntaxHighlighter
          language={lang || "text"}
          style={normalizeThemeStyle(vscDarkPlus)}
          customStyle={{
            background: "#020617",
            borderRadius: 8,
            padding: 12,
            fontSize: 11,
            overflow: "auto",
            margin: 0,
          }}
          wrapLongLines
          PreTag="div"
        >
          {raw.replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    },

    div({ node, className, children, ...rest }) {
      const kind = (node as any)?.properties?.["data-admonition"];
      if (typeof kind === "string") {
        return <Admonition kind={kind}>{children}</Admonition>;
      }
      return (
        <div className={className} {...rest}>
          {children}
        </div>
      );
    },

    // Better looking tables
    table({ children }) {
      return (
        <div className="my-3 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
    th({ children }) {
      return (
        <th className="border-b border-neutral-800 bg-neutral-950/60 px-3 py-2 text-left text-xs font-semibold text-neutral-200">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="border-b border-neutral-900 px-3 py-2 text-sm text-neutral-200">
          {children}
        </td>
      );
    },

    // Nicer blockquotes
    blockquote({ children }) {
      return (
        <blockquote className="my-3 border-l-4 border-neutral-700 bg-neutral-950/30 px-4 py-2 text-sm text-neutral-200">
          {children}
        </blockquote>
      );
    },

    // Safer links
    a({ href, children }) {
      const safe = href ?? "#";
      return (
        <a
          href={safe}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-neutral-600 underline-offset-2 hover:decoration-neutral-300"
        >
          {children}
        </a>
      );
    },
   
  };

  return (
    <div className="prose prose-invert max-w-none prose-p:my-2 prose-li:my-1 prose-pre:my-2 prose-code:text-neutral-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkAdmonitions]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function JsonPretty({ value }: { value: unknown }) {
  return (
    <SyntaxHighlighter
      language="json"
      style={normalizeThemeStyle(vscDarkPlus)}
      customStyle={{
        background: "#020617",
        borderRadius: 8,
        padding: 12,
        fontSize: 11,
        maxHeight: "20rem",
        overflow: "auto",
        margin: 0,
      }}
      wrapLongLines
      PreTag="div"
    >
      {JSON.stringify(value, null, 2)}
    </SyntaxHighlighter>
  );
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

  // NEW: MD-shaped agent data
  const [agentDoc, setAgentDoc] = React.useState<AgentMdDocResponse | null>(
    null
  );

  // selected tool name within the current agent
  const [selectedToolName, setSelectedToolName] =
    React.useState<string | null>(null);

  // Load all tenants (admin view)
  React.useEffect(() => {
    (async () => {
      setTenantsLoading(true);
      setTenantsError(null);
      try {
        const json = await fetchJsonOrThrow<AdminTenantListResponse>(
          "/api/agents/tenants",
          "tenants"
        );
        if (!json.ok) throw new Error(json.error || "Tenants response not ok.");
        setTenants(json.tenants || []);

        const contextInList = json.tenants.find(
          (t) => t.tenantId === contextTenantId
        );
        if (contextInList) setSelectedTenantId(contextInList.tenantId);
        else if (json.tenants.length > 0) setSelectedTenantId(json.tenants[0].tenantId);
        else setSelectedTenantId(null);
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
        const raw = await fetchJsonOrThrow<AgentListResponse>(
          `/api/agents?tenantId=${encodeURIComponent(effectiveTenantId)}`,
          "/api/agents"
        );
        if (!raw.ok) throw new Error(raw.error || "Agent list not ok.");

        setAgents(raw.agents || []);
        setSelectedAgentId(raw.agents?.[0]?.agentId ?? null);
      } catch (e: any) {
        setListError(e?.message || "Failed to load agents.");
        setAgents([]);
        setSelectedAgentId(null);
      } finally {
        setLoadingList(false);
      }
    })();
  }, [effectiveTenantId]);

  // Fetch selected agent MD doc
  React.useEffect(() => {
    if (!effectiveTenantId || !selectedAgentId) {
      setAgentDoc(null);
      setSelectedToolName(null);
      return;
    }

    (async () => {
      setLoadingAgent(true);
      setAgentError(null);
      try {
        const json = await fetchJsonAllowErrors<AgentMdDocResponse>(
          `/api/agents/${encodeURIComponent(selectedAgentId)}?tenantId=${encodeURIComponent(effectiveTenantId)}`,
          "agent detail"
        );

        setAgentDoc(json);
        if (!json.ok) setAgentError(json.error || "Agent detail not ok.");
        else setAgentError(null);

        // Init tool selector
        const tools = json.tools ?? [];
        if (tools.length > 0 && typeof tools[0]?.name === "string") {
          setSelectedToolName(tools[0].name);
        } else {
          setSelectedToolName(null);
        }
      } catch (e: any) {
        setAgentError(e?.message || "Failed to load agent spec.");
        setAgentDoc(null);
        setSelectedToolName(null);
      } finally {
        setLoadingAgent(false);
      }
    })();
  }, [effectiveTenantId, selectedAgentId]);

  const handleAgentSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAgentId(e.target.value || null);
  };

  const handleTenantSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value || "";
    setSelectedTenantId(value || null);
    setSelectedAgentId(null);
    setAgentDoc(null);
    setAgentError(null);
  };

  const selectedTenantMeta = React.useMemo(() => {
    if (!effectiveTenantId) return null;
    return tenants.find((t) => t.tenantId === effectiveTenantId) || null;
  }, [tenants, effectiveTenantId]);

  const selectedAgentMeta = React.useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((a) => a.agentId === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const front = agentDoc?.frontmatter;
  const agentName =
    front?.agent?.name || selectedAgentMeta?.name || selectedAgentId || "Unknown agent";

  // Tool inspector (optional)
  const tools = agentDoc?.tools ?? [];
  const activeTool =
    tools.find((t: any) => t?.name && t.name === selectedToolName) || tools[0];
  const sections = agentDoc?.sections ?? [];

  return (
    <div className="mx-auto max-w-6xl p-4 xs:p-6 text-neutral-50">
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
              {tenants.length === 0 && <option value="">No tenants found</option>}
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.tenantId} — {t.name} [{t.status}]
                </option>
              ))}
            </select>
          )}

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
              {agents.length === 0 && <option value="">No agents found</option>}
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.name || a.agentId}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {agentError && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/40 p-4 text-sm text-red-100">
          {agentError}
        </div>
      )}     

     {agentDoc?.validationErrors != null && (
        <SectionCard title="Frontmatter Validation Errors">
          <JsonPretty value={agentDoc.validationErrors as unknown} />
        </SectionCard>
      )}

      {agentDoc?.spec_errors?.length ? (
        <SectionCard title="Spec Consistency Errors">
          <ul className="list-disc pl-5 text-xs">
            {agentDoc.spec_errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}


      {loadingAgent ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          Loading agent spec…
        </div>
      ) : !agentDoc || !front ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400">
          {listError ? "Unable to load agents." : "Select a tenant and agent to view its spec."}
        </div>
      ) : (
        <div className="space-y-4">
          {/* REQUIRED HEADER FIELDS ONLY */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SectionCard title="Header">
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="muted">schema: {front.schema}</Badge>
                  <Badge tone="muted">agentId: {front.agent.agentId}</Badge>
                </div>

                <div className="text-base font-semibold text-neutral-50">
                  {agentName}
                </div>

                <div className="text-xs text-neutral-500">
                  tenantId:{" "}
                  <span className="font-mono text-neutral-300">
                    {front.agent.tenantId}
                  </span>
                </div>

                {front.agent.tone && (
                  <div className="text-xs text-neutral-400">
                    tone:{" "}
                    <span className="font-mono text-neutral-200">
                      {front.agent.tone}
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Meta">
              {front.meta ? (
                <JsonPretty value={front.meta} />
              ) : (
                <span className="text-xs text-neutral-500">No meta.</span>
              )}
            </SectionCard>

            <SectionCard title="Tools (from frontmatter)">
              {front.tools && front.tools.length > 0 ? (
                <JsonPretty value={front.tools} />
              ) : (
                <span className="text-xs text-neutral-500">No tools list.</span>
              )}
            </SectionCard>

            {agentDoc?.core_tools?.length ? (
              <SectionCard title="Core Tools (names only)">
                <div className="flex flex-wrap gap-2">
                  {agentDoc.core_tools.map((n) => (
                    <Badge key={n} tone="muted">{n}</Badge>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>

          {/* OPTIONAL: tool descriptor inspector (DB-fetched tools) */}
          <SectionCard title="Tool Descriptors (fetched)">
            {agentDoc.tools_errors && agentDoc.tools_errors.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-600 bg-amber-900/30 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-100">
                    Tool validation issues
                  </span>
                  <Badge tone="warn">
                    {agentDoc.tools_errors.length} issue
                    {agentDoc.tools_errors.length > 1 ? "s" : ""}
                  </Badge>
                </div>
                <ul className="space-y-1 text-[11px] text-amber-100">
                  {agentDoc.tools_errors.map((err, idx) => (
                    <li key={idx} className="font-mono">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tools.length === 0 ? (
              <div className="text-xs text-neutral-500">
                No tool descriptors returned by API.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                  <select
                    value={selectedToolName ?? (activeTool?.name ?? "")}
                    onChange={(e) =>
                      setSelectedToolName(e.target.value ? e.target.value : null)
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
                      const isActive = activeTool && t.name === activeTool.name;
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
                          <span className="font-mono text-[11px]">{t.name}</span>
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

                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                  {activeTool ? (
                    <div className="space-y-2">
                      <div className="font-mono text-sm text-neutral-50">
                        {activeTool.name}
                      </div>
                      {activeTool.description && (
                        <div className="text-xs text-neutral-400">
                          {activeTool.description}
                        </div>
                      )}
                      <JsonPretty value={activeTool} />
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500">
                      Select a tool to inspect its configuration.
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* DYNAMIC SECTION RENDERING */}       

          <div className="grid grid-cols-1 gap-3">
            {sections.map((s, idx) => (
              <SectionCard key={`${s.title}-${idx}`} title={s.title}>
                <MarkdownBlock markdown={s.body} />
              </SectionCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
