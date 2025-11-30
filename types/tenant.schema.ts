// types/tenant.schema.ts
import { z } from "zod";

// Enums
export const TenantStatusEnum = z.enum([
  "active",
  "trial",
  "suspended",
  "cancelled",
]);

export const BillingProviderEnum = z.enum(["stripe", "braintree", "other"]);

export const BillingStatusEnum = z.enum([
  "active",
  "trialing",
  "past_due",
  "cancelled",
]);

export const PlanIntervalEnum = z.enum(["month", "year"]);

export const DatastoreTypeEnum = z.enum(["mongo", "rest"]);

export const FallbackBehaviorEnum = z.enum([
  "handoff_to_human",
  "apologize_and_end",
]);

// Subschemas
const IdentitySchema = z.object({
  legalName: z.string().optional(),
  displayName: z.string().optional(),
  domain: z.string().optional(),
  industry: z.string().optional(),
  timeZone: z.string().default("America/Chicago"),
  locale: z.string().default("en-US"),
});

const ContactPersonSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
});

const BasicContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
});

const ContactsSchema = z.object({
  primary: ContactPersonSchema.optional(),
  billing: BasicContactSchema.optional(),
  technical: BasicContactSchema.optional(),
});

const BillingAddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const BillingPlanSchema = z.object({
  planId: z.string().optional(),
  name: z.string().optional(),
  interval: PlanIntervalEnum.optional(),
  seatLimit: z.number().optional(),
  agentLimit: z.number().optional(),
  trialEndsAt: z.date().optional(),
});

const CardSnapshotSchema = z.object({
  brand: z.string().optional(),
  last4: z.string().optional(),
  expMonth: z.number().optional(),
  expYear: z.number().optional(),
});

const BillingSchema = z.object({
  provider: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(BillingProviderEnum)
    .optional(),
  customerId: z.string().optional(),
  defaultPaymentMethodId: z.string().optional(),
  currency: z.string().default("USD"),
  billingEmail: z.string().optional(),
  taxId: z.string().optional(),
  billingAddress: BillingAddressSchema.optional(),
  plan: BillingPlanSchema.optional(),
  cardSnapshot: CardSnapshotSchema.optional(),
  status: BillingStatusEnum.default("trialing"),
  nextBillingDate: z.date().optional(),
});


export const AgentRepoSchema = z.object({
  provider: z.enum(["github"]),
  baseRawUrl: z.string().url(), // full raw URL to the MD file
});

export const AgentConfigSchema = z.object({
  agentId: z.string(),          // e.g. "concierge"
  label: z.string().optional(), // e.g. "Cypress Concierge" (for admin UI)
  agentRepo: AgentRepoSchema,
});

export const AgentSettingsSchema = z.array(AgentConfigSchema);

const LimitsSchema = z.object({
  maxAgents: z.number().default(5),
  maxConcurrentCalls: z.number().default(10),
  maxMonthlyMinutes: z.number().default(1000),
  maxRequestsPerMinute: z.number().default(60),
});

const FlagsSchema = z.object({
  betaFeatures: z.boolean().default(false),
  allowExternalBrandInfo: z.boolean().default(true),
  allowExperimentalModels: z.boolean().default(false),
});

const WidgetKeySchema = z.object({
  id: z.string().optional(),       // internal ID for this key (UUID, etc.)
  key: z.string(),                 // public widget key, e.g. "w_acme_7f1b0e9c64f54d1a"
  origin: z.string().optional(),   // optional website origin binding, e.g. "https://www.acme.com"
  label: z.string().optional(),    // “Main site”, “Staging”, etc.
  revoked: z.boolean().default(false),
  createdAt: z.date().optional(),
});

// Main tenant schema
export const TenantSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  status: TenantStatusEnum.default("trial"),

  identity: IdentitySchema.optional(),
  contacts: ContactsSchema.optional(),
  billing: BillingSchema.optional(), 
  agentSettings: AgentSettingsSchema.optional(),
  limits: LimitsSchema.optional(),
  flags: FlagsSchema.optional(),  

  widgetKeys: z.array(WidgetKeySchema).default([]),

  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type AgentRepo = z.infer<typeof AgentRepoSchema>;

export type Tenant = z.infer<typeof TenantSchema>;

export type WidgetKey = z.infer<typeof WidgetKeySchema>;
