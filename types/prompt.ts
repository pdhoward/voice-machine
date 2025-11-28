// /types/prompt.ts
export type ToolUsageEntry = {
  name: string;
  description?: string;
  parameters?: any;
};

export type StructuredPrompt = {
  agent: {
    tenantId: string;
    name?: string;
    tone?: string;
    style_rules?: string[];
    [k: string]: any;
  };
  capabilities?: any;
  policy?: any;
  dialog_flow?: any;
  response_templates?: Record<string, string>;
  examples?: any[];

  // 🔽 optional tools (already validated) + any validation errors
  tools?: any[];          
  tools_errors?: string[]; 

  [k: string]: any;
};

export type PromptDoc = {
  agent?: {
    tenantId: string;
    name?: string;
  };
  instructions: StructuredPrompt | string;
  [k: string]: any;
};
