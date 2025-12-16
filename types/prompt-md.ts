// src/types/agent-md.ts

export type AgentMdFrontmatter = {
  schema: string; // required
  agent: {
    tenantId: string; // required
    agentId: string; // required
    name: string; // required
    tone?: string;
    start?: string;
    fetch_current_date?: string;
    [k: string]: unknown;
  };
  meta?: {
    version?: number;
    lastUpdatedBy?: string;
    notes?: string;
    [k: string]: unknown;
  };
  tools?: Array<{
    source: "registry" | "inline" | string;
    tenantId?: string;
    names?: string[];
    [k: string]: unknown;
  }>;
  // allow future expansion without breaking
  [k: string]: unknown;
};

export type AgentListItem = {
  agentId: string;
  name: string;
  filename?: string;
};

export type AgentListResponse = {
  ok: boolean;
  agents: AgentListItem[];
  error?: string;
};

export type AgentMdDocSection = {
  title: string;
  body: string;
};
export type AgentMdDocResponse = {
  ok: boolean;

  // success (and also returned on 422 so UI can still render)
  md?: string;
  frontmatter?: any;
  sections?: AgentMdDocSection[];

  // tool payload
  tools?: any[];           // registry tool descriptors only
  core_tools?: string[];   // core tool names only
  tools_errors?: string[];

  // validation / consistency errors
  validationErrors?: unknown; // zod flatten output
  spec_errors?: string[];

  // general error message
  error?: string;
};
export type AdminTenantItem = {
  tenantId: string;
  name: string;
  status: string;
};

export type AdminTenantListResponse = {
  ok: boolean;
  tenants: AdminTenantItem[];
  error?: string;
};
