# Voice-Machine: AI Guest Experience Platform
## Complete Development & Refactoring Plan

**Prepared:** May 2026  
**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind · Shadcn/UI · Supabase · Vercel · OpenAI Realtime · Vapi

---

## Three Questions Answered

### Q1: Should we keep MongoDB or migrate to Supabase?

**Verdict: Migrate to Supabase. This is not a close call.**

The recommendation is not motivated by preference — it is driven by three specific platform requirements that MongoDB cannot satisfy cleanly:

**Reason 1: Supabase Realtime (Human Co-Pilot Dashboard)**

The human oversight layer — staff monitoring live conversations and intervening in real time — requires push updates from the database to the browser the moment a message is written. MongoDB change streams can do this but require a persistent server-side listener and custom WebSocket plumbing. Supabase Realtime is a first-class feature of the platform: subscribe to a table from the client SDK in 5 lines. When a new message row is inserted, every subscribed dashboard updates within milliseconds. Zero infrastructure, zero configuration, works on Vercel edge.

**Reason 2: Row Level Security (Tenant Isolation)**

Every MongoDB query in the current codebase includes a manual `{ tenantId: req.tenantId }` filter. This is correct but it means tenant isolation is enforced at the application layer — one missed filter is a data leak. Supabase Row Level Security enforces isolation at the database. No matter what the application code does, a tenant cannot see another tenant's data. This is the correct security model for a multi-tenant SaaS.

**Reason 3: PostgreSQL Full-Text Search (Knowledge Base)**

The property knowledge base (menus, policies, local guides, FAQs) needs to be searchable when loaded context is large. PostgreSQL `tsvector` full-text search is native, fast, requires no extensions, and is part of the Supabase stack. No third-party search service, no embeddings pipeline, no vectors.

**Additional reasons:**
- The data is relational: tenants → guests → stays → conversations → messages. PostgreSQL handles this naturally with foreign keys and joins. MongoDB handles it awkwardly.
- Other projects in this workspace already use Supabase — same mental model, same tooling, same billing account.
- `db/connections/index.ts` (100 lines of LRU MongoDB connection pooling) becomes `lib/supabase/client.ts` (8 lines).

**What changes:** Migration cost is approximately 3 days. Every subsequent phase builds more cleanly on Supabase than it would on MongoDB.

---

### Q2: What changes if we keep the browser chat/voice widget?

**Nothing is removed. All three channels are additive and share the same AI brain.**

The browser widget stays. Phone calls (via Vapi) are added alongside it. The widget gains a **chat mode** in addition to the existing **voice mode**, giving guests three ways to engage:

| Channel | Technology | Use Case |
|---|---|---|
| Phone call | Vapi + OpenAI Realtime | Guest calls the hotel number |
| Browser voice | WebRTC + OpenAI Realtime | Voice on hotel website or in-room tablet |
| Browser chat | AI SDK `useChat` + OpenAI | Text on hotel website, lower friction |

All three channels:
- Use the same assembled system prompt from Supabase tenant config
- Access the same tool catalog
- Write to the same `conversations` + `messages` tables
- Look up the same guest profile (by phone number for Vapi, by email/session for browser)
- Feed the same human co-pilot dashboard in real time

The widget embed gains a `mode` query parameter:
- `?mode=voice` — current WebRTC voice interface (unchanged)
- `?mode=chat` — new text chat interface (Vercel AI SDK streaming)
- `?mode=hybrid` — guest chooses voice or chat at start; can switch mid-session

Chat mode is cheaper to run (OpenAI Chat API vs Realtime API), loads faster, and works on every device.

---

### Q3: What changes for full conversation transfer to human?

**The full transcript travels with the call. The receiving human is briefed before they say a word.**

**For phone escalations (Vapi transfer):**

1. AI detects escalation trigger (guest frustration, explicit request, VIP threshold)
2. Platform generates an AI summary of the conversation in < 150 words
3. Vapi fires `transferCall` — routes call to staff phone number
4. Simultaneously, platform sends an SMS to that staff number:
   ```
   INCOMING TRANSFER — David Chen (VIP Gold)
   Issue: Room maintenance delay, frustrated after 20 min wait
   View full conversation: https://[platform]/dashboard/conversations/[id]
   ```
5. Staff answers the phone already knowing who is calling, what happened, and what the guest needs.
6. The conversation view shows: full transcript from first word, sentiment timeline, guest capsule, stay history, every tool the AI called.

**For chat escalations:**

1. Conversation status changes to `escalated` in Supabase → Supabase Realtime fires to dashboard
2. Staff sees full transcript from message 1, guest profile panel, AI summary pinned at top
3. Staff takes over — types responses that the guest sees immediately
4. Guest sees a seamless handoff: "You're now connected with Sarah at the front desk."

**Key technical requirement:** Messages are written to Supabase in **real time as they occur** — not batched at session end. The transcript link in the escalation SMS is always current and complete.

---

## Guest Intelligence Layer: The Capsule Architecture

This replaces RAG and semantic vector search entirely.

The core insight: for a hospitality concierge, you always know exactly which guest you are serving. There is no universe of documents to search. The right pattern is **context compilation** — curate and assemble the right structured data for this specific guest, right now.

### What Is a Guest Capsule?

Each guest has a durable, structured bundle of data that lives in Supabase. At session start, the platform compiles this bundle into a context block and injects it into the system prompt. This is the guest's voice to the AI.

```
GUEST INTELLIGENCE BRIEF
─────────────────────────────────────────────────────
Name: David Chen  |  VIP: Gold  |  Language: English  |  Stays: 4
Phone: +1-305-555-0192  |  Arrival: May 22  |  Departure: May 26

PREFERENCES (learned from prior stays)
• Room: Ocean view, high floor, king bed
• Dietary: No shellfish
• Communication: Direct answers, no small talk
• Other: Prefers late checkout when available

STAY HISTORY
• Current:  Suite 402  check-in May 22
• Mar 2026: Room 318  kayaking package · spa on day 2 — all positive
• Sep 2025: Room 202  complained about HVAC noise — resolved same day
• Jun 2025: Room 108  first stay — very positive, left 5-star review

RECENT INTERACTIONS
• Today 10:14 AM — Maintenance issue Room 402 → escalated to Sarah → RESOLVED
• Mar 2026 — Called to book kayaking excursion — completed

KNOWN FACTS
• Celebrates anniversary in March (mentioned during Mar 2026 stay)
• Has expressed interest in spa treatments before
• Has complained about being put on hold (mentioned twice)

STAFF NOTES
• "VIP Gold — always offer complimentary welcome amenity on arrival."
─────────────────────────────────────────────────────
```

This block is roughly 400–700 tokens. It fits trivially inside any context window. It is completely inspectable. It contains only structured facts from Supabase — no approximations, no retrieved chunks, no similarity scores.

### How the Capsule Is Built

`lib/intelligence/capsule.ts` runs at session start and compiles the guest capsule from five Supabase queries:

```typescript
async function buildGuestCapsule(tenantId, guestId): Promise<string> {
  const [guest, stays, recentConvos, memoryEvents] = await Promise.all([
    supabase.from('guests').select('*').eq('id', guestId).single(),
    supabase.from('stays').select('*')
      .eq('guest_id', guestId).order('check_in', { ascending: false }).limit(5),
    supabase.from('conversations').select('id, summary, channel, created_at')
      .eq('guest_id', guestId).eq('status', 'completed').order('created_at', { ascending: false }).limit(3),
    supabase.from('memory_events').select('event_type, content, created_at')
      .eq('guest_id', guestId).order('created_at', { ascending: false }).limit(20)
  ])
  return formatCapsule({ guest, stays, recentConvos, memoryEvents })
}
```

Five parallel queries. No embeddings. No similarity math. Deterministic, fast (< 50ms), fully auditable.

### How Memory Events Are Written

After every conversation, `lib/intelligence/extractFacts.ts` sends the full transcript to `gpt-4o-mini` with a structured extraction prompt:

```
Given this conversation transcript, extract up to 10 durable facts about the guest
that would be useful in a future interaction. Focus on:
- Stated preferences
- Complaints (and whether resolved)
- Expressed interests
- Personal details they volunteered
- Service recovery history

Return as JSON array: [{ "event_type": "preference|complaint|fact|interest", "content": "..." }]
```

Each extracted fact is stored as a row in `memory_events`. On the next call, these rows are loaded and compiled into the capsule. The AI never has to "find" anything — the platform surfaces it.

### Knowledge Base: Full Context Injection + Full-Text Search Tool

The property knowledge base (spa menu, dining options, local recommendations, policies, FAQs, event calendar) is handled with two strategies depending on size:

**Strategy A — Full Injection (default, boutique hotels)**

A boutique hotel's complete knowledge base is typically 50–150 items averaging 200 tokens each: roughly 10,000–30,000 tokens total. `gpt-4o` has a 128k context window. The entire knowledge base is loaded from Supabase at session start, organized by category, and injected into the system prompt. No search required. The AI has everything.

```
PROPERTY KNOWLEDGE BASE
─────────────────────────────────────────────────────
[POLICIES]
Check-in: 3:00 PM | Check-out: 11:00 AM | Late checkout: $75 if available
...

[SPA & WELLNESS]
The Cypress Spa is open 9 AM – 9 PM daily.
Services: Swedish massage ($120/60 min), Deep tissue ($140/60 min)...

[DINING]
Latitude Restaurant: Breakfast 7–11 AM, Dinner 6–10 PM
Signature dishes: Pan-seared snapper, Tasting menu ($95pp)...

[LOCAL RECOMMENDATIONS]
Art Deco District: 10-min walk, best mornings before crowds
Versailles Restaurant: Cuban food, 15-min drive, open late...

[CURRENT EVENTS]
Jazz on the Lawn: Fridays 7–9 PM, complimentary for guests
Sunset Yoga: Daily 6:30 AM, pool deck, complimentary
─────────────────────────────────────────────────────
```

**Strategy B — Full-Text Search Tool (large knowledge bases)**

When a knowledge base exceeds a configured token budget (configurable per agent), the platform provides the AI with a `search_hotel_knowledge` tool backed by Supabase full-text search:

```sql
SELECT title, content, category
FROM knowledge_items
WHERE tenant_id = $1
  AND to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $2)
ORDER BY ts_rank(to_tsvector('english', title || ' ' || content),
                 plainto_tsquery('english', $2)) DESC
LIMIT 5;
```

The AI calls this tool when it needs to look something up. The search is keyword-based, instant, and returns the most relevant items ranked by PostgreSQL's built-in relevance scoring. No embeddings, no approximate nearest-neighbor — just battle-tested full-text search that has worked in production databases for decades.

The Concierge Studio lets the tenant configure which strategy applies and set the token budget threshold.

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GUEST INTERACTION LAYER                           │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   PHONE CALL     │  │  BROWSER VOICE   │  │  BROWSER CHAT    │       │
│  │   Vapi           │  │  WebRTC          │  │  AI SDK Stream   │       │
│  │   PSTN number    │  │  OpenAI Realtime │  │  OpenAI Chat API │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
└───────────┼────────────────────┼────────────────────┼─────────────────-┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI ORCHESTRATION LAYER                            │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  assembleSystemPrompt(tenantId, agentId, guestId)                 │  │
│  │  → personality + escalation rules + current upsell offers         │  │
│  │  → guest intelligence capsule (profile + stays + memory events)   │  │
│  │  → property knowledge base (full inject or search tool)           │  │
│  └─────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐  │
│  │  Tool Execution Engine (preserved from current platform)          │  │
│  │  HTTP tools · core tools · booking · upsells · knowledge search   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE LAYER                                  │
│                                                                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │
│  │  Tenant    │  │  Guest     │  │ Knowledge  │  │  Conversations │    │
│  │  Config    │  │  Capsule   │  │  Base      │  │  + Messages    │    │
│  │  Studio    │  │  + Events  │  │  Full-Text │  │  (real-time)   │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘    │
│                                                                           │
│  Row Level Security enforces tenant isolation at the database layer       │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼  Supabase Realtime subscriptions
┌─────────────────────────────────────────────────────────────────────────┐
│                       HUMAN OVERSIGHT LAYER                               │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Staff Co-Pilot Dashboard  /dashboard                             │  │
│  │  Live transcript · sentiment signal · intervention · escalation   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Escalation Transfer Flow                                         │  │
│  │  Vapi transfer webhook → AI summary → SMS to staff with link      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema (Supabase / PostgreSQL)

```sql
-- ─── ENABLE EXTENSIONS ──────────────────────────────────────────────────
-- pg_trgm enables trigram-based LIKE acceleration (fast fuzzy search on names/phone)
-- No vector extension needed.

create extension if not exists pg_trgm;

-- ─── TENANTS ─────────────────────────────────────────────────────────────

create table tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,          -- e.g. "cypress-resort"
  name          text not null,
  status        text not null default 'trial', -- trial | active | suspended
  plan          text not null default 'starter',
  config        jsonb not null default '{}',   -- limits, flags, billing refs
  created_at    timestamptz default now()
);

-- ─── AGENTS (AI PERSONALITIES PER TENANT) ───────────────────────────────

create table agents (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  name                  text not null,         -- "Aria", "Marco", "Cypress Concierge"
  slug                  text not null,
  voice_id              text not null default 'alloy',
  language              text not null default 'en',
  greeting              text not null,
  tone                  text not null default 'warm, professional',
  system_prompt         text not null,
  escalation_rules      jsonb not null default '[]',
  knowledge_strategy    text not null default 'inject', -- 'inject' | 'search_tool'
  knowledge_token_limit int not null default 20000,     -- switch to search_tool above this
  upsells               jsonb not null default '[]',
  vapi_assistant_id     text,
  phone_number          text,
  transfer_numbers      jsonb not null default '[]',    -- [{label, number, trigger}]
  enabled               boolean not null default true,
  created_at            timestamptz default now(),
  unique(tenant_id, slug)
);

-- ─── TOOLS (HTTP TOOL CATALOG) ───────────────────────────────────────────

create table tools (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  agent_id      uuid references agents(id) on delete cascade,  -- null = all agents
  name          text not null,
  description   text,
  kind          text not null default 'http_tool',
  http_config   jsonb,        -- urlTemplate, method, headers, body template
  ui_config     jsonb,        -- onSuccess, onError display actions
  parameters    jsonb not null default '{"type":"object","properties":{}}',
  enabled       boolean not null default true,
  priority      int not null default 0,
  created_at    timestamptz default now(),
  unique(tenant_id, name)
);

-- ─── SECRETS VAULT ───────────────────────────────────────────────────────

create table tenant_secrets (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  key_name        text not null,
  encrypted_value text not null,   -- AES-256 encrypted at app layer
  created_at      timestamptz default now(),
  unique(tenant_id, key_name)
);

-- ─── WIDGET KEYS ─────────────────────────────────────────────────────────

create table widget_keys (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  key             text unique not null,
  agent_id        uuid references agents(id),
  allowed_origins text[] not null default '{}',
  label           text,
  revoked         boolean not null default false,
  created_at      timestamptz default now()
);

-- ─── KNOWLEDGE BASE ──────────────────────────────────────────────────────
-- No vectors. Full-text search via PostgreSQL tsvector.
-- For small knowledge bases: full inject into system prompt.
-- For large: AI uses search_hotel_knowledge tool backed by tsvector query.

create table knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  content     text not null,
  category    text not null,  -- 'spa' | 'dining' | 'policies' | 'local' | 'events' | 'faq'
  sort_order  int default 0,  -- controls injection order in prompt
  source_url  text,
  created_at  timestamptz default now()
);

-- Full-text search index (no vectors, no extensions beyond pg_trgm)
create index knowledge_fts_idx on knowledge_items
  using gin(to_tsvector('english', title || ' ' || content));

-- Fast category filter (used for full inject strategy)
create index knowledge_category_idx on knowledge_items (tenant_id, category, sort_order);

-- ─── GUEST PROFILES ──────────────────────────────────────────────────────

create table guests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  phone             text,
  email             text,
  first_name        text,
  last_name         text,
  language          text default 'en',
  vip_level         text,                -- null | 'silver' | 'gold' | 'platinum'
  preferences       jsonb default '{}',  -- room_type, dietary, wake_time, etc.
  notes             text,                -- staff-editable free text
  generated_summary text,               -- AI-written capsule paragraph, updated post-stay
  created_at        timestamptz default now(),
  unique(tenant_id, phone),
  unique(tenant_id, email)
);

-- Trigram index for fast name/phone fuzzy search in Concierge Studio guest lookup
create index guests_phone_trgm on guests using gin(phone gin_trgm_ops);
create index guests_name_trgm  on guests using gin((first_name || ' ' || last_name) gin_trgm_ops);

-- ─── MEMORY EVENTS (THE FACT LOG) ────────────────────────────────────────
-- Structured facts extracted from conversations after each session.
-- Replaces vector-based memory retrieval with a curated, inspectable fact log.
-- Pattern inspired by Mem0 / Graphiti — implemented as plain SQL rows.

create table memory_events (
  id                      uuid primary key default gen_random_uuid(),
  guest_id                uuid not null references guests(id) on delete cascade,
  tenant_id               uuid not null references tenants(id) on delete cascade,
  event_type              text not null,  -- 'preference' | 'complaint' | 'request' | 'fact' | 'interest' | 'resolution'
  content                 text not null,  -- "Prefers hypoallergenic pillows"
  confidence              float default 1.0,
  source_conversation_id  uuid references conversations(id),
  created_at              timestamptz default now()
);

create index memory_events_guest_idx on memory_events (guest_id, created_at desc);

-- ─── STAY HISTORY ────────────────────────────────────────────────────────

create table stays (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  guest_id    uuid not null references guests(id) on delete cascade,
  check_in    date not null,
  check_out   date,
  room_type   text,
  room_number text,
  notes       text,
  created_at  timestamptz default now()
);

create index stays_guest_idx on stays (guest_id, check_in desc);
create index stays_checkin_idx on stays (tenant_id, check_in);  -- for journey orchestration cron

-- ─── CONVERSATIONS ───────────────────────────────────────────────────────

create table conversations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  agent_id            uuid references agents(id),
  guest_id            uuid references guests(id),
  channel             text not null,    -- 'phone' | 'web_voice' | 'web_chat' | 'widget_voice' | 'widget_chat'
  status              text not null default 'active',  -- active | escalated | human | completed
  sentiment_score     float,            -- rolling average, updated per guest message
  vapi_call_id        text,
  webrtc_session_id   text,
  summary             text,             -- AI-generated at escalation or session end
  created_at          timestamptz default now(),
  ended_at            timestamptz
);

create index conversations_tenant_status on conversations (tenant_id, status, created_at desc);
create index conversations_guest_idx on conversations (guest_id, created_at desc);

-- ─── MESSAGES ────────────────────────────────────────────────────────────
-- Written in real time — every utterance as it occurs.
-- Powers: co-pilot live view · escalation transcript · post-session fact extraction.
-- No embeddings. Facts are extracted post-session into memory_events.

create table messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  role              text not null,    -- 'user' | 'assistant' | 'system' | 'staff'
  content           text not null,
  sentiment         float,            -- -1.0 (frustrated) to 1.0 (positive), scored per guest message
  tool_call         jsonb,            -- if this message triggered a tool call
  created_at        timestamptz default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

-- ─── ESCALATIONS ─────────────────────────────────────────────────────────

create table escalations (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  tenant_id         uuid not null references tenants(id) on delete cascade,
  reason            text,             -- 'sentiment_threshold' | 'explicit_request' | 'vip' | 'keyword'
  summary           text not null,    -- AI-generated brief for receiving staff
  transfer_number   text,
  sms_sent_at       timestamptz,
  status            text not null default 'pending',   -- pending | acknowledged | resolved
  assigned_to       text,
  resolved_at       timestamptz,
  created_at        timestamptz default now()
);

-- ─── USAGE ───────────────────────────────────────────────────────────────

create table usage_records (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  conversation_id   uuid references conversations(id),
  tokens_in         int default 0,
  tokens_out        int default 0,
  audio_seconds     float default 0,
  cost_usd          float default 0,
  revenue_generated float default 0,
  created_at        timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────

alter table agents          enable row level security;
alter table tools           enable row level security;
alter table tenant_secrets  enable row level security;
alter table widget_keys     enable row level security;
alter table knowledge_items enable row level security;
alter table guests          enable row level security;
alter table memory_events   enable row level security;
alter table stays           enable row level security;
alter table conversations   enable row level security;
alter table messages        enable row level security;
alter table escalations     enable row level security;
alter table usage_records   enable row level security;

-- Pattern applied to every table:
-- create policy "tenant isolation" on [table]
--   using ( tenant_id = (auth.jwt() ->> 'tenant_id')::uuid );
```

---

## Multi-Channel Architecture

### Channel 1: Phone (Vapi)

Vapi is purpose-built voice AI infrastructure. It handles:
- PSTN inbound numbers per tenant
- OpenAI Realtime model orchestration
- Native human call transfer with custom metadata
- Webhooks for every conversation event
- Call recording + transcription

**How it integrates:**

```
Guest calls hotel number
        ↓
Vapi receives call → GET /api/vapi/config?assistantId={id}&callerPhone={phone}
        ↓
Platform: guest lookup by phone → build capsule → assemble system prompt
        ↓
Vapi runs conversation with OpenAI Realtime + tenant tools
        ↓
Every message → POST /api/vapi/webhook → insert into messages → Supabase Realtime fires
        ↓
Escalation trigger → Vapi transferCall → webhook → escalation record + SMS to staff
        ↓
Session end → extract memory events from transcript → update guest capsule
```

### Channel 2: Browser Voice (WebRTC — current platform, preserved)

The existing WebRTC + OpenAI Realtime implementation is kept with one change: it calls `assembleSystemPrompt()` from Supabase instead of fetching agent markdown from GitHub. Everything else in `lib/realtime/index.ts` is preserved.

### Channel 3: Browser Chat (new)

Text widget using the Vercel AI SDK `useChat` hook (the `ai` package is already in package.json). Uses OpenAI Chat Completions — not Realtime — which is cheaper for text-only interactions.

```typescript
// app/widget/chat/page.tsx
const { messages, input, handleSubmit } = useChat({
  api: '/api/chat',
  body: { tenantId, agentId, guestId, conversationId }
})
```

The `/api/chat` route:
1. Calls `assembleSystemPrompt()` — builds full prompt including guest capsule + knowledge
2. Streams response via OpenAI Chat
3. Writes each message to `messages` table as it arrives
4. Scores guest message sentiment
5. Evaluates escalation rules after each guest message

### Widget Embed

```html
<!-- Voice only -->
<script src="https://[platform]/widget.js"
  data-widget-key="w_cypress_abc123"
  data-mode="voice"></script>

<!-- Chat only -->
<script src="https://[platform]/widget.js"
  data-widget-key="w_cypress_abc123"
  data-mode="chat"></script>

<!-- Guest chooses (recommended) -->
<script src="https://[platform]/widget.js"
  data-widget-key="w_cypress_abc123"
  data-mode="hybrid"></script>
```

---

## Escalation & Human Transfer: Complete Flow

### Scenario A: Phone Call Escalation

```
1. Guest on phone call with AI
   ├── Rolling sentiment average drops below configured threshold
   └── OR guest says "I want to speak to someone" / "get me a manager"

2. AI: "Of course. Let me connect you with our front desk team right now."

3. Platform executes escalation sequence (< 2 seconds, parallel):
   a. Generate AI summary via gpt-4o (< 150 words):
      "David Chen (VIP Gold) called about a maintenance issue in Room 402.
       He has been waiting 20+ minutes. This is his 4th stay.
       Prior stays all positive. Recommend immediate service recovery."

   b. Insert escalation record (status: pending)
   c. Update conversation.status = 'escalated'
   d. Send SMS to designated staff number:
      ─────────────────────────────────────────
      GUEST TRANSFER INCOMING
      David Chen · VIP Gold · Room 402
      Issue: Maintenance delay — frustrated
      ──
      Full conversation:
      https://[platform]/dashboard/c/[id]
      ─────────────────────────────────────────
   e. Vapi executes transferCall

4. Staff answers. They have already read the SMS.

5. Staff opens the transcript link on their phone while talking:
   - Full transcript from word one
   - Sentiment timeline (green → red)
   - Guest capsule: 4 stays, preferences, staff notes
   - Tools the AI called and their results

6. Staff marks escalation resolved → conversation.status = 'completed'
7. Memory events extracted post-session → guest capsule updated
```

### Scenario B: Chat Escalation

```
1. Escalation rule fires during chat session
2. conversation.status → 'escalated' → Supabase Realtime fires to dashboard
3. Staff dashboard: alert notification (sound + red highlight)
4. Staff sees full transcript from message 1 + guest capsule + AI summary
5. Staff takes over typing — guest sees "You're now connected with Sarah."
6. AI is silenced (conversation.status = 'human' blocks AI responses)
7. Session ends → memory events extracted → capsule updated
```

### Transcript View (`/dashboard/conversations/[id]`)

Accessible by authenticated staff and via time-limited SMS link (4-hour token, no full login required):

```
┌────────────────────────────────────────────────────────────────────┐
│  David Chen · VIP Gold · Room 402                    ● ESCALATED   │
│  Check-in: May 22 · Check-out: May 26 · Stay #4                   │
├────────────────────────────────────────────────────────────────────┤
│  AI SUMMARY                                                         │
│  "Maintenance delay in Room 402, guest frustrated after 20+ min    │
│   wait. VIP, 4th stay, all prior stays positive. Recommend         │
│   service recovery offer."                                          │
├────────────────────────────────────────────────────────────────────┤
│  TRANSCRIPT                                                         │
│                                                                     │
│  [10:14:02] GUEST: "Hi I need help with my room"          😐 0.1  │
│  [10:14:05] AI:    "Hello David! Welcome back to Cypress..."       │
│  [10:15:22] GUEST: "I've been waiting 20 minutes"         😐 -0.3 │
│  [10:15:25] AI:    "I sincerely apologize for the delay..."        │
│  [10:17:44] GUEST: "This is not acceptable"               😠 -0.8 │
│  [10:17:46] AI:    [tool: check_maintenance_status → pending]      │
│  [10:18:30] GUEST: "I want to speak to someone now"       😠 -0.9 │
│  [10:18:32] AI:    "Of course. Connecting you now..."              │
│  ── TRANSFERRED TO FRONT DESK ───────────────────────────────────  │
│  [10:18:45] STAFF: "Hello David, this is Sarah..."                 │
└────────────────────────────────────────────────────────────────────┘
```

---

## Refactored Code Architecture

### Files to Remove

```
db/connections/index.ts          — MongoDB LRU pool → replaced by Supabase client
db/indexes/                      — All MongoDB index scripts
lib/agent/agentMd.ts             — GitHub markdown parser → replaced by DB-native config
lib/agent/managePrompts.ts       — GitHub-based prompt management
lib/auth/                        — Custom OTP → replaced by Supabase Auth
```

### New Core Modules

```
lib/
├── supabase/
│   ├── client.ts                 # Browser Supabase client (anon key)
│   └── admin.ts                  # Server Supabase client (service role key)
│
├── agent/
│   ├── assemblePrompt.ts         # Compiles full system prompt:
│   │                               personality + capsule + knowledge + upsells
│   └── knowledgeLoad.ts          # Load knowledge base by category OR build search tool
│
├── intelligence/
│   ├── capsule.ts                # Build guest capsule from 5 parallel Supabase queries
│   ├── extractFacts.ts           # Post-session: LLM extracts memory_events from transcript
│   └── updateCapsule.ts          # Merge new facts, refresh generated_summary
│
├── memory/
│   ├── guestLookup.ts            # Find guest by phone (Vapi) or email (browser)
│   └── guestCreate.ts            # Create anonymous or identified guest profile
│
├── vapi/
│   ├── client.ts                 # Vapi REST API client
│   ├── provision.ts              # Create/update Vapi assistant from agents row
│   ├── webhook.ts                # Handle all Vapi conversation events
│   └── transfer.ts               # Escalation: summary → SMS → transferCall
│
├── escalation/
│   ├── rules.ts                  # Evaluate escalation rules against conversation state
│   ├── summarize.ts              # AI-generated brief for staff
│   └── notify.ts                 # SMS (Twilio or Vapi inject) + Supabase Realtime
│
├── knowledge/
│   ├── load.ts                   # Load all items by category for inject strategy
│   └── search.ts                 # Supabase full-text search (search_tool strategy)
│
└── sentiment/
    └── score.ts                  # Score guest messages: gpt-4o-mini structured output
```

### New API Routes

```
/api/vapi/config          GET   — Vapi requests dynamic assistant config per call
/api/vapi/webhook         POST  — All Vapi conversation events
/api/chat                 POST  — Browser chat streaming (Vercel AI SDK)
/api/escalate             POST  — Manual or auto escalation trigger
/api/knowledge/items      CRUD  — Knowledge base management
/api/guests/lookup        POST  — Find or create guest by phone/email
/api/studio/agents        CRUD  — Agent personality management
/api/studio/tools         CRUD  — Tool catalog management
/api/studio/widget        CRUD  — Widget key + appearance management
```

### Existing Routes to Simplify

```
/api/tools/execute        — Keep. Replace MongoDB secret lookup with Supabase query.
/api/session              — Keep. Replace MongoDB usage tracking with Supabase.
/api/agents/[agentId]     — Keep endpoint, rewrite to read from Supabase agents table.
/api/transcripts/*        — Remove. Supabase messages table replaces this entirely.
/api/usage/report         — Keep. Rewrite to insert into usage_records.
/api/health               — Keep as-is.
```

---

## Concierge Studio (Tenant Self-Service UI)

The no-code admin portal. Any hotel configures their AI in under 30 minutes, no engineering.

```
/studio
├── /dashboard            — Usage metrics, active conversations, revenue dashboard
├── /personality          — AI name, voice selector (playable previews), tone chips,
│                           greeting, language, capabilities, restrictions
│                           Live test call button
├── /knowledge            — Add items by category (spa, dining, local, policies, events, faq)
│                           Upload text/PDF · set injection strategy · token budget display
├── /tools                — Visual HTTP tool builder
│                           URL template, headers, body mapping, live test runner
├── /widget               — Mode (voice/chat/hybrid) · colors · position
│                           Generates embed <script> snippet · widget key management
├── /escalation           — Sentiment threshold slider · keyword triggers · transfer numbers
│                           Test escalation flow button
├── /guests               — Guest profile browser · search by name/phone/email
│                           View capsule · memory events · stay history · edit notes
└── /team                 — Staff accounts · notification preferences · dashboard access
```

**Personality builder — prompt assembly:**

```
[PROPERTY]           → "Cypress Resort & Spa, Miami Beach"
[AI NAME]            → "Aria"
[TONE]               → warm · professional · elegant (selectable chips)
[GREETING]           → "Welcome to Cypress Resort. I'm Aria, your personal concierge."
[CAPABILITIES]       → ✓ Reservations  ✓ Spa  ✓ Dining  ✓ Transportation  ✓ Local Guide
[RESTRICTIONS]       → "Never discuss competitor properties. Escalate billing disputes."
[UPSELL CONTEXT]     → auto-injected at session time from agents.upsells config
[GUEST CAPSULE]      → auto-compiled at session time from Supabase (capsule.ts)
[KNOWLEDGE BASE]     → auto-loaded at session time (inject or search_tool per strategy)
```

`assemblePrompt.ts` combines these sections at session start. No markdown files, no GitHub commits, no rebuilds. Changes in Studio take effect on the next call.

---

## Build Phases

### Phase 0 — Supabase Foundation
**Duration: 3 days**  
**Goal: Replace MongoDB entirely. Zero visible feature change.**

1. Create Supabase project. Run schema migrations above.
2. Enable RLS on all tenant-scoped tables.
3. Write `lib/supabase/client.ts` (browser) and `lib/supabase/admin.ts` (server).
4. Migrate tenant records from MongoDB → Supabase tenants table.
5. Migrate actions collection → Supabase tools table.
6. Rewrite API routes one by one: `/api/agents`, `/api/session`, `/api/tools/execute`, `/api/usage/report`.
7. Replace custom OTP auth (`lib/auth/`) with Supabase Auth magic links.
8. Remove: `mongodb` package, `db/connections/`, `db/indexes/`.
9. Remove: `lib/agent/agentMd.ts`, `lib/agent/managePrompts.ts`.

**Verify:** All existing functionality works. Auth works. Tool execution works. Zero MongoDB connections.

---

### Phase 1 — Concierge Studio (Tenant Self-Service)
**Duration: 5 days**  
**Goal: Any hotel onboards and configures their AI without engineering help.**

1. Build `/studio` layout with sidebar navigation.
2. **Personality tab**: Agent name, voice selector (playable previews), tone chips, greeting, language, capabilities checkboxes, restrictions field. Saves to `agents` table.
3. **Knowledge tab**: Add items by category with title + content fields. Upload PDF → extract text → create items. Set injection strategy (inject vs search_tool) and token budget. Shows current total token estimate. Items stored in `knowledge_items`.
4. **Tools tab**: Visual HTTP tool builder — URL template with `{param}` highlighting, header editor, JSON body template, live test runner. Saves to `tools` table.
5. **Widget tab**: Mode selector, color picker, position. Generates embed `<script>` snippet. Manages widget keys.
6. **Escalation tab**: Sentiment threshold slider, keyword list, transfer number fields.
7. Write `assemblePrompt.ts`: pulls personality → calls `capsule.ts` for guest context → calls `knowledgeLoad.ts` for knowledge → appends upsells.
8. Write `knowledgeLoad.ts`: if strategy = 'inject', fetch all items grouped by category and format as prompt section. If strategy = 'search_tool', register `search_hotel_knowledge` as a tool backed by Supabase full-text search.
9. Update `/api/agents/[agentId]` to return assembled prompt from Supabase instead of GitHub markdown.

**Verify:** Create new test tenant in Studio. Full conversation uses configured personality and knowledge.

---

### Phase 2 — Phone Integration (Vapi)
**Duration: 4 days**  
**Goal: Every tenant gets a real phone number. Guests call → AI answers.**

1. Add Vapi API client to `lib/vapi/client.ts`.
2. Write `lib/vapi/provision.ts`: given an `agents` row, creates or updates a Vapi assistant (model, voice, dynamic config URL, tools, transfer numbers). Saves `vapi_assistant_id` + `phone_number` back to agents row.
3. Add "Provision Phone Number" button in Concierge Studio Personality tab.
4. Write `/api/vapi/config` route: Vapi calls this per-call. Receives caller phone number. Runs guest lookup, builds capsule, assembles full system prompt, returns tool definitions. Every call gets fresh, personalized context.
5. Write `/api/vapi/webhook` route:
   - `conversation-update` → insert message into Supabase `messages` in real time
   - `status-update` → update conversation status
   - `end-of-call-report` → finalize conversation, trigger memory event extraction, update usage
   - `transfer-destination-answered` → mark escalation acknowledged
6. Write `lib/vapi/transfer.ts`: generate summary → insert escalation → send SMS → return transferCall action.
7. Vapi tool calls route to `/api/tools/execute` (existing, simplified).

**Verify:** Call test tenant phone number. AI answers with correct personality. Transcript appears in Supabase in real time. End call → memory events extracted.

---

### Phase 3 — Browser Chat Widget (New Channel)
**Duration: 2 days**  
**Goal: Text chat option on hotel website, feeding the same AI and co-pilot.**

1. Create `/api/chat` route: `streamText` via Vercel AI SDK. Calls `assemblePrompt()`. Writes messages to Supabase in real time. Scores sentiment. Checks escalation rules after each guest message.
2. Create `app/widget/chat/page.tsx` using `useChat` hook. Optional guest email/name capture for identity.
3. Update `app/widget/page.tsx` to read `?mode` parameter: `voice` → WebRTC component, `chat` → chat component, `hybrid` → mode selection screen.
4. Update `voicewidgets/` embed script to pass mode parameter through.
5. Chat escalation: update conversation status → fire Supabase Realtime event → show handoff message in widget.

**Verify:** Embed chat widget on test page. Messages appear in Supabase. Escalation triggers dashboard alert.

---

### Phase 4 — Guest Intelligence Layer (Capsule + Memory Events)
**Duration: 4 days**  
**Goal: The AI greets returning guests by name, recalls preferences, references prior stays.**

1. Write `lib/memory/guestLookup.ts`:
   - Phone: query `guests` by `(tenant_id, phone)` from Vapi caller ID
   - Chat/web: query by email if provided; else create anonymous session
2. Write `lib/intelligence/capsule.ts`:
   - 5 parallel Supabase queries: guest row + stays (last 5) + recent conversations (last 3 summaries) + memory events (last 20) + staff notes
   - Format as the structured capsule block shown earlier in this document
   - Total compilation time target: < 50ms
3. Update `assemblePrompt.ts` to call `buildGuestCapsule()` and include the result.
4. Write `lib/intelligence/extractFacts.ts`:
   - Runs post-session (triggered by `end-of-call-report` or chat session end)
   - Sends full transcript to `gpt-4o-mini` with structured extraction prompt
   - Receives JSON array of `{ event_type, content }` facts
   - Inserts each as a row in `memory_events`
   - Updates `guests.preferences` jsonb with any new preference facts
   - Generates new `guests.generated_summary` paragraph (AI writes a 3-sentence human-readable capsule summary)
5. Add guest profile viewer in Concierge Studio `/studio/guests`:
   - Search by name, phone, email (trigram index makes this fast)
   - View full capsule as the AI sees it
   - View memory events timeline (inspectable, staff can delete incorrect facts)
   - View stay history
   - Edit staff notes

**Verify:** Make two test calls from same number. Second call: AI says "Welcome back, [name]" and correctly references a detail from the first call.

---

### Phase 5 — Human Co-Pilot Dashboard
**Duration: 5 days**  
**Goal: Staff sees all active conversations live. Can intervene instantly. Receives escalation alerts.**

1. Create `/dashboard` layout: Active Conversations · Escalations · Guest Profiles · Metrics.
2. **Active Conversations panel**: Supabase Realtime subscription to `conversations` filtered by `tenant_id` + `status IN (active, escalated)`. Shows: guest name, channel icon, duration, live sentiment badge.
3. **Conversation view**: Supabase Realtime subscription to `messages` for selected `conversation_id`. Messages appear as they are inserted. Shows role (guest / AI / staff / tool call) + timestamp + sentiment dot.
4. **Guest context panel**: Beside transcript — compiled capsule, VIP badge, current stay, preferences. Pulled from same Supabase queries as `capsule.ts`.
5. **AI Suggestion**: When staff opens an escalated conversation, `POST /api/suggest` with last 10 messages → `gpt-4o` returns a suggested response in the tone of the property. Staff can inject as-is, edit, or dismiss.
6. **Intervention modes**:
   - Inject Response: staff types → inserts message with role `staff` → AI picks it up as context (voice) or sends directly to guest (chat)
   - Take Over: sets `conversation.status = 'human'` → AI receives system injection to stand down → staff types directly
7. **Escalation alerts**: Supabase Realtime subscription to `escalations`. New row → toast notification (sound + visual). Opens full transcript view with AI summary pinned at top.
8. **Transcript view** (`/dashboard/conversations/[id]`): Full transcript from session start. Accessible via authenticated dashboard or SMS time-limited link (4-hour window, no full login for staff receiving phone transfer).

**Verify:** Run test conversation. Open dashboard in second tab — messages arrive live within 1 second. Trigger escalation — SMS arrives with working link before staff would answer the phone. Open link — full transcript visible, capsule displayed.

---

### Phase 6 — Emotional Intelligence Layer
**Duration: 2 days**  
**Goal: Platform detects frustration automatically and acts before the guest has to ask.**

1. Write `lib/sentiment/score.ts`: `gpt-4o-mini` with structured output. Returns `{ score: float, category: 'positive'|'neutral'|'frustrated'|'urgent'|'confused' }`. Runs per guest message. Stored in `messages.sentiment`.
2. Write `lib/escalation/rules.ts`: evaluates configured rules after each guest message:
   - Rolling sentiment average over last N messages
   - Keyword detection (configurable per tenant)
   - VIP + negative sentiment combination rule
   - Explicit escalation phrases
3. Rules configured in Concierge Studio Escalation tab, stored in `agents.escalation_rules` jsonb.
4. Rule fires → call `lib/vapi/transfer.ts` (phone) or set conversation status (chat).
5. Co-pilot dashboard sentiment indicator updates in real time: green → yellow → red as conversation trends negative.

**Verify:** Configure sentiment threshold at -0.5. Have test conversation with frustrated language. Escalation fires within 2 guest messages.

---

### Phase 7 — Revenue Engine
**Duration: 3 days**  
**Goal: The AI generates measurable revenue for the hotel, not just saves costs.**

1. Add Upsell Offers section to Concierge Studio Personality tab:
   - Define offers: name, description, price, trigger conditions (time_of_day, stay_day, weather, guest_vip)
   - Stored in `agents.upsells` jsonb
2. Update `assemblePrompt.ts` to inject active upsells as a prompt section:
   ```
   CURRENT OFFERS (weave in naturally when relevant, never pushy):
   - Spa Package: $180, available tomorrow, ideal if weather is poor
   - Late Checkout: $75, offer on guest's last evening
   - Sunset Cruise: $120pp, Fri/Sat departures
   ```
3. Add `create_upsell_booking` core tool: triggers Stripe PaymentIntent, confirms in-call or sends payment link via SMS.
4. Track closed upsells in `usage_records.revenue_generated`.
5. Add Revenue tab to Studio dashboard: daily/weekly/monthly AI-closed revenue, breakdown by offer type.

**Verify:** Configure a spa upsell with weather trigger. Test conversation where guest asks about tomorrow. Verify AI mentions spa naturally. Booking flow completes and revenue is tracked.

---

### Phase 8 — Guest Journey Orchestration
**Duration: 3 days**  
**Goal: AI proactively touches guests at every lifecycle stage, not only when they call.**

Implemented as Supabase Edge Functions on cron schedule:

| Stage | Trigger | Action |
|---|---|---|
| Pre-arrival | `check_in = tomorrow` | Vapi outbound call or SMS: welcome, offer to arrange anything |
| Arrival day | `check_in = today`, 2 PM | SMS: "Ready when you arrive. I can arrange early check-in." |
| Day 2 of stay | stay active, 10 AM | SMS with today's events + weather-based suggestion |
| Pre-checkout | `check_out = tomorrow` | Vapi call: late checkout offer, arrange airport transport |
| Post-checkout | `check_out = yesterday` | SMS: thank you + feedback link + "see you next time" |
| Re-engagement | no stay in 6 months | Personalized SMS with seasonal offer using guest capsule |

Guest communication preference (call vs SMS) stored in `guests.preferences`. All outbound touchpoints create a `conversations` record for full staff visibility. Memory events extracted post-outreach and merged into capsule.

---

## Migration Execution Order

```
Week 1:  Phase 0 (Supabase foundation) + Phase 1 (Concierge Studio)
Week 2:  Phase 2 (Vapi phone) + Phase 3 (Browser chat)
Week 3:  Phase 4 (Guest Intelligence Layer) + Phase 5 (Co-pilot dashboard)
Week 4:  Phase 6 (Emotional intelligence) + Phase 7 (Revenue engine)
Week 5:  Phase 8 (Journey orchestration) + QA + first tenant onboarding
```

Phase 0 + 1 + 2 alone is a launchable product: phone AI with personality configuration, self-service onboarding, and working widget.

---

## Dependency Changes

```diff
# Remove
- mongodb
- lru-cache           (was MongoDB connection pooling only)
- nodemailer          (replaced by Supabase Auth magic links)

# Add
+ @supabase/supabase-js
+ @supabase/ssr
+ vapi-web            (Vapi SDK for browser voice mode)
+ twilio              (escalation SMS — or use Vapi message injection)

# Keep (unchanged)
+ stripe, @stripe/react-stripe-js, @stripe/stripe-js
+ @upstash/ratelimit, @upstash/redis
+ ai, @ai-sdk/openai, @ai-sdk/react
+ zod, jose, uuid
+ All Radix UI / Shadcn components
+ next, react, tailwindcss, typescript
```

Note: No vector or embedding library is added. The intelligence layer runs on structured SQL queries and `gpt-4o-mini` structured output extraction — both already covered by the existing `@ai-sdk/openai` package.

---

## What Does Not Change

- Next.js App Router structure
- OpenAI Realtime WebRTC implementation (`lib/realtime/index.ts`)
- Tool execution engine (`/api/tools/execute`) — simplified, not replaced
- Widget embed architecture (widget keys, origin validation)
- Stripe payment flow
- Upstash Redis rate limiting
- Vercel deployment configuration
- All Shadcn/Radix UI components
- TypeScript + Zod validation patterns

---

## Success Criteria

| Milestone | Criteria |
|---|---|
| Phase 0 complete | Zero MongoDB queries remain. All existing features work. |
| Phase 1 complete | New tenant configures and tests their AI in < 30 minutes, no code. |
| Phase 2 complete | Phone number provisioned. Guest calls, AI answers with correct personality. Transcript in Supabase in real time. |
| Phase 4 complete | Return caller greeted by name. At least one prior stay detail surfaced accurately. Memory events visible in Studio guest view. |
| Phase 5 complete | Staff sees live messages within 1 second. Escalation SMS arrives with working transcript link. Full transcript and capsule visible at link. |
| Platform launch | First paying hotel tenant live on phone + widget, co-pilot dashboard in use by staff. |
