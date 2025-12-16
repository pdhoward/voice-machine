import { z } from "zod";

export const AgentMdFrontmatterSchema = z
  .object({
    schema: z.string().min(1),
    agent: z
      .object({
        tenantId: z.string().min(1),
        agentId: z.string().min(1),
        name: z.string().min(1),
      })
      .passthrough(),
    meta: z
      .object({
        version: z.number().optional(),
        lastUpdatedBy: z.string().optional(),
        notes: z.string().optional(),
      })
      .passthrough()
      .optional(),
    tools: z
      .array(
        z
          .object({
            source: z.string().min(1),
            tenantId: z.string().optional(),
            names: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

export type AgentMdFrontmatterValidated = z.infer<typeof AgentMdFrontmatterSchema>;
