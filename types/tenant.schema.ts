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
  provider: BillingProviderEnum.optional(),
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

const DatastoreAuthSchema = z.object({
  userId: z.string().optional(),
  password: z.string().optional(), // encrypted in your app
});

const DatastoreSchema = z.object({
  type: DatastoreTypeEnum.default("mongo"),
  connectionUri: z.string().optional(),
  databaseName: z.string().optional(),
  collectionName: z.string().optional(),
  searchDefaults: z
    .object({
      maxResults: z.number().default(20),
      minScore: z.number().default(0.5),
    })
    .optional(),
  auth: DatastoreAuthSchema.optional(),
});

const APISchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  uri: z.string(),
  key: z.string(), // encrypted in your app
});

const VoiceAgentSchema = z.object({
  agentId: z.string().optional(), // ObjectId as string
  defaultLanguage: z.string().default("en-US"),
  defaultVoice: z.string().optional(),
  maxConversationMinutes: z.number().default(30),
  fallbackBehavior: FallbackBehaviorEnum.default("apologize_and_end"),
});

const ConfigSchema = z.object({
  datastores: z.array(DatastoreSchema).default([]),
  APIs: z.array(APISchema).default([]),
  voiceAgent: VoiceAgentSchema,
});

const PersonaSchema = z.object({
  tone: z.string().optional(),
  greeting: z.string().optional(),
  closing: z.string().optional(),
});

const AgentSettingsSchema = z.object({
  defaultAgentId: z.string().optional(),
  allowedTools: z.array(z.string()).default([]),
  maxParallelSessions: z.number().default(10),
  persona: PersonaSchema.optional(),
});

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
  config: ConfigSchema,
  agentSettings: AgentSettingsSchema.optional(),
  limits: LimitsSchema.optional(),
  flags: FlagsSchema.optional(),

  widgetKeys: z.array(WidgetKeySchema).default([]),

  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Tenant = z.infer<typeof TenantSchema>;

export type WidgetKey = z.infer<typeof WidgetKeySchema>;
