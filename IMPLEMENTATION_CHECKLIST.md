# Implementation Checklist — 3 Priorities

> Quick-reference for tracking progress. Check off items as completed.

---

## Priority 1: Dashboard & Operations Intelligence

### Phase 1A: Schema & Infrastructure (2 days)
- [x] Add `DashboardWidget`, `DashboardSnapshot`, `AlertRule` models to `prisma/schema.prisma`
- [x] Run `npx prisma db push --accept-data-loss` (Schema synced)
- [x] Create snapshot cron job (`/api/cron/dashboard-snapshots/route.ts`)
- [x] Add composite indexes for dashboard queries

### Phase 1B: Server Actions (3 days)
- [x] `getExecutiveKPIs(timeRange)` — revenue, pipeline, cash, conversion, alerts
- [x] `getRevenueTrend(timeRange)` — daily/weekly/monthly buckets
- [x] `getPipelineVelocity(timeRange)` — stage counts + conversion rates
- [x] `getCashPosition()` — receivables, payables, cash register balance
- [x] `getConversionFunnel(timeRange)` — lead → contact → quote → order
- [x] `getActiveAlerts()` — evaluate AlertRule thresholds
- [x] `subscribeToKPIUpdates(userId, widgets)` — WS subscription helper

### Phase 1C: Core UI Components (4 days)
- [x] `KPICard` — value, trend, sparkline, threshold alert, click handler
- [x] `RevenueTrendChart` — Recharts area/line, comparison period toggle
- [x] `PipelineFunnel` — Recharts funnel, hover shows count + conversion %
- [x] `StockAgingTable` — TanStack Table, sortable, filterable, CSV export
- [x] `ActivityFeed` — virtualized, real-time, grouped by date
- [x] `WidgetGrid` — react-grid-layout, draggable, resizable, persist to DashboardWidget

### Phase 1D: Role-Based Config (2 days)
- [x] Default widget layouts per role (ADMIN, MANAGER, STAFF)
- [x] User widget customization modal (add/remove/reorder/configure)
- [x] Persist to `DashboardWidget` table
- [x] Role-based default fallback

### Phase 1E: Real-time & Alerts (3 days)
- [ ] WS event types: `kpi_update`, `alert_triggered`, `alert_resolved`
- [ ] Socket.io handlers in `ws-server/index.js`
- [ ] Client hook `useRealtimeKPIs(widgets)`
- [ ] Alert rule evaluation cron (every 5 min)
- [ ] `notifyManagers` integration for alert channels (in-app, WA, email)

### Phase 1F: Export & Scheduling (2 days)
- [ ] PDF export (react-to-print or puppeteer)
- [ ] CSV export for tables
- [ ] Scheduled email snapshots (cron + email template)
- [ ] Email template for daily/weekly executive summary

---

## Priority 2: Group Ticket Routing (Evolution WhatsApp)

### Phase 2A: Schema Migration (2 days)
- [x] Add `EvolutionGroupNote`, `DepartmentSLA`, `TicketSLA`, `Macro`, `CSATResponse`, `RoutingRule` models
- [x] Run `npx prisma db push` (Routing schema synced)
- [ ] Seed default SLAs per department
- [ ] Seed global macros (greeting, hours, handoff, etc.)

### Phase 2B: Rule Engine & SLA (3 days)
- [x] `lib/routing/rule-engine.ts` — evaluate `RoutingRule` conditions
- [x] Integrate rule engine into `resolveDepartmentForMessage` (priority: MENTION > RULE > KEYWORD > AI > EXISTING > DEFAULT)
- [x] `lib/routing/sla.ts` — calculate due dates, business hours, timezone
- [x] Attach SLA config to routing result for ticket creation
- [x] Cron job: check SLA breaches every minute, escalate, notify

### Phase 2C: Internal Notes & Collision Detection (3 days)
- [ ] `EvolutionGroupNote` CRUD actions
- [ ] Internal notes panel in ticket detail (side panel)
- [ ] Socket.io events: `ticket:typing`, `ticket:view`, `agent:typing`
- [ ] "Agent X is typing..." indicator in composer
- [ ] Active viewer avatars in ticket header

### Phase 2D: Macro System (2 days)
- [ ] Macro CRUD (global + per-department)
- [ ] Variable resolution: `{{customerName}}`, `{{ticketId}}`, `{{orderId}}`, custom
- [ ] Composer integration: Macro dropdown, search, insert at cursor
- [ ] Keyboard shortcut: `/` to open macro picker

### Phase 2E: CSAT Survey (2 days)
- [ ] Post-resolve webhook trigger (when ticket status → RESOLVED)
- [ ] Send WhatsApp template with 1-5 buttons (Evolution interactive buttons)
- [ ] `CSATResponse` model + webhook handler for button callbacks
- [ ] CSAT dashboard widget (average, distribution, trend)

### Phase 2F: Visual Rule Builder (4 days)
- [ ] React Flow canvas for rule construction
- [ ] Condition nodes: field (text/subject/sender), operator (contains/equals/regex), value
- [ ] Action nodes: assign department, assign user, add tag, set priority, send template
- [ ] Priority ordering (drag to reorder)
- [ ] Test rule against sample messages
- [ ] Save → creates `RoutingRule` record

### Phase 2G: Reporting Dashboard (3 days)
- [ ] Volume: messages/tickets by department, day, agent
- [ ] SLA: first response time (avg/p50/p95), resolution time, breach rate
- [ ] CSAT: score distribution, trend, by agent/department
- [ ] Agent performance: tickets handled, avg response, CSAT, SLA adherence
- [ ] Export: CSV + scheduled email

### Phase 2H: Advanced Features (2 days)
- [ ] Conversation merge: select multiple tickets → merge into one
- [ ] Advanced filters: date range, department, agent, status, tags, SLA state
- [ ] Bulk actions: assign, tag, change status, export
- [ ] Keyboard shortcuts for power users

---

## Priority 3: Workflow Automation

### Phase 3A: Schema Migration (2 days)
- [x] Add `Automation`, `AutomationVersion`, `AutomationExecution`, `AutomationStepExecution`, `AutomationDeadLetter` models
- [x] Extend `AutomationStep` with new fields (retryPolicy, timeoutMs, continueOnError)
- [x] Run `npx prisma db push` (Automation V2 schema synced)
- [ ] Migrate existing `WaAutomation` data to new schema

### Phase 3B: Trigger/Action Registry (3 days)
- [ ] `lib/automation/registry.ts` — Zod schemas for all trigger/action types
- [ ] Define 15+ trigger types (WA, CRM events, Schedule, Webhook, Manual)
- [ ] Define 20+ action types (WA, CRM, Email, HTTP, Slack, Flow control)
- [ ] Type-safe config validation per type
- [ ] Variable reference schema (`{{trigger.field}}`, `{{steps.id.output.field}}`)

### Phase 3C: Execution Engine (4 days)
- [ ] `lib/automation/engine.ts` — topological step execution
- [ ] Context accumulation across steps
- [ ] Variable resolution with fallback/defaults
- [ ] Retry policy: exponential backoff, max retries, dead letter queue
- [ ] Step timeout enforcement
- [ ] `continueOnError` branching
- [ ] Rate limiting per automation (token bucket)
- [ ] Execution logging to `AutomationExecution` + `AutomationStepExecution`

### Phase 3D: Visual Builder (5 days)
- [ ] React Flow canvas with custom node types
- [ ] Node palette: Trigger, Action, Condition, Delay, Loop, Variable
- [ ] Edge types: success, failure, condition true/false, loop iteration
- [ ] Minimap, zoom controls, fit view
- [ ] Real-time validation: required fields, connected outputs, no cycles (except loops)
- [ ] Undo/redo history (50 steps)
- [ ] Keyboard shortcuts (delete, duplicate, copy/paste nodes)
- [ ] Auto-layout button (dagre)

### Phase 3E: Testing Panel (3 days)
- [ ] "Test Run" button: mock trigger payload editor (JSON + form)
- [ ] Step-by-step replay: click any step → see input/output/context
- [ ] Time travel: slider to view context at each step
- [ ] Breakpoints (dev mode): pause before/after step
- [ ] Console: structured logs per step
- [ ] Compare runs: diff two executions

### Phase 3F: Versioning (2 days)
- [ ] "Publish" creates `AutomationVersion` snapshot
- [ ] Version history panel: view, diff, rollback
- [ ] Draft vs Published badge
- [ ] Changelog per version (auto-generated + manual notes)
- [ ] Only published versions execute via triggers

### Phase 3G: Template Library (2 days)
- [ ] 10+ pre-built recipes:
  - [ ] New Lead → Welcome WA + Assign Sales + Create Follow-up
  - [ ] Order Delivered → Wait 7d → CSAT Survey → Thank You
  - [ ] Stock Low → Create PO → Notify Manager → Post to WA Group
  - [ ] Invoice Overdue → Reminder Email → WA Follow-up → Escalate
  - [ ] Dealer Order → Approve → Allocate Stock → Schedule Dispatch
  - [ ] Custom Order Measurement → Schedule → Remind → Confirm
  - [ ] New Contact → Enrich → Tag → Add to Nurture Sequence
  - [ ] Payment Received → Update Invoice → Receipt WA → Thank You
  - [ ] Field Visit Scheduled → Remind Staff → Post-Visit Follow-up
  - [ ] Appointment Booked → Confirm WA → Remind 1h Before
- [ ] "Use Template" button in builder → pre-populates canvas

### Phase 3H: Monitoring & Quotas (2 days)
- [ ] Execution dashboard: success rate, avg duration, error breakdown
- [ ] Per-automation quotas: max runs/day, max concurrent
- [ ] Global quota: total executions/hour
- [ ] Alert on: failure spike, DLQ growth, quota near limit
- [ ] Dead letter queue UI: inspect, retry, discard

---

## Cross-Cutting Tasks

### Dependencies & Setup
- [ ] `npm install recharts react-grid-layout reactflow zod date-fns pino pino-pretty`
- [ ] `npm install -D @types/react-grid-layout playwright @playwright/test`
- [ ] Configure `next.config.mjs` for Turbopack + standalone output

### Testing
- [ ] Unit tests: routing rule engine, SLA calc, automation engine, KPI aggregates
- [ ] Integration tests: webhook → ticket, automation trigger → execution
- [ ] E2E tests: dashboard load, ticket lifecycle, automation create→run
- [ ] Visual regression: dashboard widgets, routing inbox, automation builder

### Documentation
- [ ] Architecture decision records (ADRs) for each priority
- [ ] User guide: Dashboard widgets, Routing inbox, Automation builder
- [ ] API docs: new routes, webhook payloads
- [ ] Developer guide: Adding custom triggers/actions

### Deployment
- [ ] Staging environment validation
- [ ] Database migration rollback plan
- [ ] Feature flags for gradual rollout
- [ ] Monitoring dashboards (Grafana/Prometheus)
- [ ] Runbook for common operations

---

## Progress Tracking

| Priority | Phase | Status | Started | Completed | Notes |
|----------|-------|--------|---------|-----------|-------|
| 1. Dashboard | 1A Schema | ⬜ | | | |
| 1. Dashboard | 1B Actions | ⬜ | | | |
| 1. Dashboard | 1C UI | ✅ | | | |
| 1. Dashboard | 1D Config | ✅ | | | |
| 1. Dashboard | 1E Realtime | ⬜ | | | |
| 1. Dashboard | 1F Export | ⬜ | | | |
| 2. Routing | 2A Schema | ⬜ | | | |
| 2. Routing | 2B Rules/SLA | ⬜ | | | |
| 2. Routing | 2C Notes/Collision | ⬜ | | | |
| 2. Routing | 2D Macros | ⬜ | | | |
| 2. Routing | 2E CSAT | ⬜ | | | |
| 2. Routing | 2F Rule Builder | ⬜ | | | |
| 2. Routing | 2G Reporting | ⬜ | | | |
| 2. Routing | 2H Advanced | ⬜ | | | |
| 3. Automation | 3A Schema | ⬜ | | | |
| 3. Automation | 3B Registry | ⬜ | | | |
| 3. Automation | 3C Engine | ⬜ | | | |
| 3. Automation | 3D Builder | ⬜ | | | |
| 3. Automation | 3E Testing | ⬜ | | | |
| 3. Automation | 3F Versioning | ⬜ | | | |
| 3. Automation | 3G Templates | ⬜ | | | |
| 3. Automation | 3H Monitoring | ⬜ | | | |

---

## Estimated Timeline

| Week | Focus |
|------|-------|
| 1-2 | Priority 1A-1B + Priority 2A + Priority 3A (parallel schema work) |
| 3-4 | Priority 1C + Priority 2B + Priority 3B |
| 5-6 | Priority 1D-1E + Priority 2C-2D + Priority 3C |
| 7-8 | Priority 1F + Priority 2E-2F + Priority 3D |
| 9-10 | Priority 2G-2H + Priority 3E-3F |
| 11-12 | Priority 3G-3H + Cross-cutting testing/docs |
| 13-14 | Polish, staging validation, production deploy |

**Total: ~14 weeks (3.5 months) for full implementation**

---

*Update this checklist daily. Commit completed phases with descriptive messages.*