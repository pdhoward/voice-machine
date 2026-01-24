# Voice Agent Platform - Recommendations Outline

**Date:** January 2026
**Platform:** Voice Machine - Commercial Voice Agent Platform
**Analysis Scope:** Full codebase review including widget path, demo console, API layer, data layer, and admin operations

---

## Executive Summary

The platform is architecturally sound with solid foundations in multi-tenancy, real-time voice communication, and tool extensibility. The recommendations below are organized into three categories:

1. **Refactoring Actions** - Improve existing code quality, maintainability, and performance
2. **New Components** - Fill gaps in platform capabilities
3. **Platform Enhancements** - Features to make the commercial offering more complete

---

## 1. REFACTORING ACTIONS

### 1.1 Widget Script Modernization (`public/voice-widget.js`)

**Current State:** Vanilla JavaScript with inline styles, no TypeScript, no build process

**Recommended Actions:**
- [ ] Convert to TypeScript with a bundler (esbuild/rollup) outputting a minified IIFE
- [ ] Extract inline CSS to a separate stylesheet or CSS-in-JS with scoped classes
- [ ] Add CSP-compatible nonce support for enterprise customers
- [ ] Implement widget versioning (`voice-widget.v2.js`) for breaking changes
- [ ] Add error boundary with fallback UI when bootstrap fails
- [ ] Support multiple widget instances per page (currently uses global state)
- [ ] Add `data-position` attribute (bottom-right, bottom-left, etc.)
- [ ] Add `data-theme` attribute (light/dark/auto)

**Priority:** HIGH - This is the customer-facing integration point

---

### 1.2 Consolidate Rate Limiting Logic

**Current State:** Rate limiting scattered across `config/rate.ts`, `app/api/_lib/rate-limit.ts`, and inline in routes

**Recommended Actions:**
- [ ] Create unified `lib/rate-limiter/index.ts` with a single `checkRateLimit()` function
- [ ] Abstract storage backend (currently MongoDB TTL indexes) behind an interface
- [ ] Add Redis adapter for horizontal scaling
- [ ] Implement sliding window algorithm option (currently fixed window)
- [ ] Add rate limit headers to responses (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- [ ] Create middleware wrapper for consistent application across routes

**Priority:** MEDIUM

---

### 1.3 API Route Standardization

**Current State:** Inconsistent error response formats across routes

**Recommended Actions:**
- [ ] Define standard API response envelope: `{ ok: boolean, data?: T, error?: { code: string, message: string } }`
- [ ] Create shared error handler middleware
- [ ] Standardize HTTP status code usage (currently mixing 400/401/403/500)
- [ ] Add request ID to all responses for debugging
- [ ] Implement API versioning prefix (`/api/v1/...`) for future compatibility

**Priority:** MEDIUM

---

### 1.4 WebRTC Client Refactoring (`lib/realtime/index.ts`)

**Current State:** Monolithic 800+ line class handling connection, audio, tools, and events

**Recommended Actions:**
- [ ] Extract `AudioPipeline` class (microphone capture, volume metering, playback)
- [ ] Extract `ToolRegistry` class (registration, execution, prefixes)
- [ ] Extract `ConnectionManager` class (WebRTC lifecycle, reconnection logic)
- [ ] Add connection state machine with explicit transitions
- [ ] Implement exponential backoff reconnection strategy
- [ ] Add WebRTC ICE candidate gathering timeout handling
- [ ] Create debug mode with detailed logging to console/network panel

**Priority:** MEDIUM - Important for maintainability

---

### 1.5 Tenant Configuration Management

**Current State:** Tenant config loaded per-request from MongoDB

**Recommended Actions:**
- [ ] Implement in-memory cache with TTL (5-minute refresh)
- [ ] Add cache invalidation webhook for immediate updates
- [ ] Create `TenantConfigService` singleton with lazy loading
- [ ] Add tenant config schema versioning for migrations
- [ ] Separate runtime config (rate limits) from static config (branding)

**Priority:** LOW - Performance optimization

---

### 1.6 Type Safety Improvements

**Current State:** Some `any` types, especially in tool execution and event handling

**Recommended Actions:**
- [ ] Define strict types for all OpenAI Realtime API events
- [ ] Create discriminated union types for tool responses
- [ ] Add Zod validation at API boundaries (already using Zod for tenant schema)
- [ ] Enable `strict: true` in tsconfig if not already
- [ ] Add generic types to `registerFunction<TArgs, TResult>()`

**Priority:** LOW

---

## 2. NEW COMPONENTS TO DEVELOP

### 2.1 Tenant Self-Service Portal

**Gap:** Tenants cannot manage their own configuration without database access

**New Components:**
- [ ] `app/(tenant)/dashboard/page.tsx` - Tenant dashboard home
- [ ] `app/(tenant)/agents/page.tsx` - Agent configuration UI
- [ ] `app/(tenant)/tools/page.tsx` - HTTP tool builder/editor
- [ ] `app/(tenant)/widget/page.tsx` - Widget key management, branding customization
- [ ] `app/(tenant)/analytics/page.tsx` - Usage analytics, session history
- [ ] `app/(tenant)/billing/page.tsx` - Subscription management (Stripe integration)
- [ ] `components/tenant/AgentBuilder.tsx` - Visual agent prompt editor
- [ ] `components/tenant/ToolBuilder.tsx` - HTTP tool definition wizard

**API Routes Needed:**
- [ ] `POST /api/tenant/agents` - CRUD for agent definitions
- [ ] `POST /api/tenant/tools` - CRUD for HTTP tools
- [ ] `POST /api/tenant/widget-keys` - Generate/revoke widget keys
- [ ] `GET /api/tenant/analytics` - Usage metrics and charts

**Priority:** HIGH - Critical for commercial viability

---

### 2.2 Agent Testing Framework

**Gap:** No automated way to test agent behavior before deployment

**New Components:**
- [ ] `lib/testing/AgentTestRunner.ts` - Programmatic agent testing
- [ ] `app/(web)/test-suite/page.tsx` - Visual test case manager
- [ ] `components/testing/ConversationSimulator.tsx` - Mock conversations
- [ ] `components/testing/ToolMocker.tsx` - Mock HTTP tool responses
- [ ] Test definition schema (YAML/JSON) for declarative test cases

**Features:**
- [ ] Define expected tool calls for given user inputs
- [ ] Assert on agent response patterns (regex, semantic similarity)
- [ ] Measure response latency and token usage
- [ ] Generate test reports with pass/fail status
- [ ] CI/CD integration webhook

**Priority:** HIGH - Essential for enterprise customers

---

### 2.3 Conversation Analytics Engine

**Gap:** Transcripts are stored but not analyzed

**New Components:**
- [ ] `lib/analytics/TranscriptAnalyzer.ts` - Extract insights from conversations
- [ ] `lib/analytics/SentimentScorer.ts` - Sentiment analysis per turn
- [ ] `lib/analytics/IntentClassifier.ts` - Identify user intents
- [ ] `lib/analytics/ConversationMetrics.ts` - Duration, turns, resolution rate
- [ ] `app/(web)/analytics/conversations/page.tsx` - Conversation explorer
- [ ] `components/analytics/ConversationHeatmap.tsx` - Usage patterns by time
- [ ] `components/analytics/TopIntentsChart.tsx` - Most common user intents
- [ ] `components/analytics/SentimentTrend.tsx` - Sentiment over time

**Priority:** MEDIUM - Differentiator for enterprise

---

### 2.4 Multi-Language Voice Support

**Gap:** Single voice (`alloy`) hardcoded, no language detection

**New Components:**
- [ ] `lib/voice/VoiceSelector.ts` - Voice recommendation based on language
- [ ] `lib/voice/LanguageDetector.ts` - Detect user language from speech
- [ ] `components/widget/LanguagePicker.tsx` - Optional language selector
- [ ] Voice configuration per agent (already have `voice` in state, need per-agent config)
- [ ] Support for ElevenLabs custom voices as alternative TTS

**Priority:** MEDIUM - Important for international customers

---

### 2.5 Webhook & Event System

**Gap:** No way for tenants to receive events about conversations

**New Components:**
- [ ] `lib/webhooks/WebhookDispatcher.ts` - Queue and deliver webhooks
- [ ] `lib/webhooks/RetryManager.ts` - Exponential backoff for failed deliveries
- [ ] `app/api/tenant/webhooks/route.ts` - Webhook configuration CRUD
- [ ] `types/webhook-events.ts` - Typed webhook payloads

**Events to Support:**
- [ ] `session.started` - New conversation began
- [ ] `session.ended` - Conversation completed
- [ ] `tool.called` - Agent invoked a tool
- [ ] `payment.completed` - Stripe payment succeeded
- [ ] `quota.warning` - Approaching usage limits
- [ ] `transcript.ready` - Full transcript available

**Priority:** MEDIUM - Required for CRM integrations

---

### 2.6 Fallback & Escalation System

**Gap:** No graceful degradation when agent can't help

**New Components:**
- [ ] `lib/escalation/EscalationRouter.ts` - Route to human agents
- [ ] `components/widget/HumanHandoff.tsx` - UI for escalation
- [ ] `app/api/escalation/route.ts` - Create escalation tickets
- [ ] Integration adapters: Zendesk, Intercom, Freshdesk, custom webhook

**Features:**
- [ ] Configurable escalation triggers (keywords, sentiment, user request)
- [ ] Transfer conversation context to human agent
- [ ] Queue position indicator in widget
- [ ] Callback scheduling when humans unavailable

**Priority:** MEDIUM - Important for customer support use cases

---

### 2.7 Knowledge Base Integration

**Gap:** Agents rely solely on prompt instructions, no RAG support

**New Components:**
- [ ] `lib/knowledge/VectorStore.ts` - Embedding storage and retrieval
- [ ] `lib/knowledge/DocumentIngester.ts` - Process docs into chunks
- [ ] `lib/knowledge/RAGTool.ts` - Tool that queries knowledge base
- [ ] `app/(tenant)/knowledge/page.tsx` - Document upload UI
- [ ] `app/api/tenant/knowledge/route.ts` - Knowledge base CRUD

**Features:**
- [ ] Support PDF, Word, HTML, plain text uploads
- [ ] Automatic chunking with overlap
- [ ] Hybrid search (semantic + keyword)
- [ ] Source attribution in agent responses
- [ ] Per-agent knowledge base scoping

**Priority:** HIGH - Major value-add for enterprise

---

### 2.8 Audit Logging System

**Gap:** No comprehensive audit trail for compliance

**New Components:**
- [ ] `lib/audit/AuditLogger.ts` - Structured audit event logging
- [ ] `types/audit-events.ts` - Typed audit event definitions
- [ ] `app/api/admin/audit/route.ts` - Query audit logs
- [ ] `app/(web)/admin/audit/page.tsx` - Audit log viewer

**Events to Log:**
- [ ] Authentication events (OTP sent, verified, failed)
- [ ] Session lifecycle (created, ended, swept)
- [ ] Tool executions with redacted payloads
- [ ] Admin actions (end session, reset usage)
- [ ] Configuration changes (tenant, agent, tools)

**Priority:** MEDIUM - Required for enterprise compliance (SOC2, HIPAA)

---

## 3. PLATFORM ENHANCEMENTS

### 3.1 Session Continuity

**Gap:** Sessions don't persist across page refreshes or device switches

**Enhancements:**
- [ ] Store session state in localStorage with encryption
- [ ] Implement session resume API endpoint
- [ ] Add `Continue conversation?` prompt on widget reopen
- [ ] Support QR code for mobile handoff

---

### 3.2 Proactive Engagement

**Gap:** Widget is purely reactive (waits for user click)

**Enhancements:**
- [ ] Configurable auto-greeting after N seconds on page
- [ ] Page-context triggers (e.g., pricing page = offer help)
- [ ] Exit-intent detection with engagement prompt
- [ ] A/B testing for greeting messages

---

### 3.3 Accessibility Compliance

**Gap:** Limited accessibility support in widget

**Enhancements:**
- [ ] Full WCAG 2.1 AA compliance
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Screen reader announcements for conversation updates
- [ ] High contrast mode
- [ ] Reduced motion option
- [ ] Text-only fallback mode

---

### 3.4 Performance Monitoring

**Gap:** No APM or performance tracking

**Enhancements:**
- [ ] Track WebRTC connection time
- [ ] Measure time-to-first-response
- [ ] Monitor tool execution latency
- [ ] Alert on degraded performance
- [ ] Integration with Datadog/New Relic/Sentry

---

### 3.5 Multi-Agent Orchestration

**Gap:** Single agent per session

**Enhancements:**
- [ ] Agent-to-agent handoff (e.g., Sales -> Support)
- [ ] Supervisor agent pattern for complex workflows
- [ ] Parallel tool execution across agents
- [ ] Shared conversation context between agents

---

### 3.6 Offline Capabilities

**Gap:** Widget requires constant connectivity

**Enhancements:**
- [ ] Service worker for offline queue
- [ ] Store messages locally when disconnected
- [ ] Sync when back online
- [ ] Offline status indicator

---

### 3.7 White-Label Customization

**Gap:** Limited branding options (color only)

**Enhancements:**
- [ ] Custom CSS injection
- [ ] Custom fonts
- [ ] Logo placement options
- [ ] Custom icon sets
- [ ] Branded loading states
- [ ] Custom domain support for widget iframe

---

### 3.8 Enterprise SSO

**Gap:** Only OTP authentication for console

**Enhancements:**
- [ ] SAML 2.0 support
- [ ] OAuth2/OIDC support
- [ ] SCIM provisioning for user management
- [ ] Role-based access control (Admin, Agent Designer, Viewer)

---

## Implementation Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Tenant Self-Service Portal | Large | Critical |
| P0 | Knowledge Base Integration | Large | High |
| P0 | Widget Script Modernization | Medium | High |
| P1 | Agent Testing Framework | Medium | High |
| P1 | Webhook & Event System | Medium | High |
| P1 | Audit Logging System | Medium | Medium |
| P2 | Conversation Analytics Engine | Large | Medium |
| P2 | Multi-Language Voice Support | Medium | Medium |
| P2 | Fallback & Escalation System | Medium | Medium |
| P2 | Rate Limiting Consolidation | Small | Medium |
| P3 | API Route Standardization | Small | Low |
| P3 | WebRTC Client Refactoring | Medium | Low |
| P3 | Enterprise SSO | Large | Medium |

---

## Architectural Notes

### Current Strengths
1. **Clean multi-tenant isolation** - tenantId consistently applied
2. **Solid security foundation** - JWT, rate limiting, bot detection
3. **Extensible tool system** - Core + HTTP tools with templating
4. **Real-time admin visibility** - SSE streaming dashboard
5. **Modern stack** - Next.js 16, React 19, TypeScript

### Technical Debt to Address
1. Widget script lacks build pipeline and versioning
2. Some API routes missing consistent error handling
3. No database migrations system (schema changes are manual)
4. Test coverage appears minimal (no test files found)
5. No CI/CD configuration visible

---

## Next Steps

1. Review and prioritize this outline
2. Create detailed specifications for P0 items
3. Establish sprint planning for implementation
4. Set up test infrastructure before major changes
5. Consider feature flags for gradual rollout

---

*This document is a living outline. Items should be refined with detailed specifications before implementation begins.*
