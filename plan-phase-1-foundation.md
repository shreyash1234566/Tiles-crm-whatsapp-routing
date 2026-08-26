# Phase 1 — Production foundation and workflow contract

## Objective

Make the Evolution group-routing foundation safe and business-correct before adding automation. This phase establishes one source of truth for a dealer inquiry, its department assignment, its follow-up obligations, and its eventual conversion into a dealer order. It also connects the existing local RAG pipeline to Evolution groups without allowing an unreviewed bot to answer a live dealer group.

## Audit result at the current baseline

### Implemented and reusable

- Evolution API connection, QR pairing, connection-state checks, and webhook registration.
- Group-only webhook ingestion with group-JID validation, message-id deduplication, per-group serialization, media download, local upload, and 25 MB protection.
- Routing precedence for employee mention/alias, department keyword, AI classification, existing group department, and Sales fallback.
- `EvolutionGroup`, `EvolutionGroupMessage`, `EvolutionGroupTicket`, and `EvolutionRoutingAudit` persistence.
- Admin transfer, claim/release, department-scoped queues, user notifications, Redis publishing, Socket.IO forwarding, and Group Inbox polling/realtime refresh.
- Text, image, audio, video, and document sending from the Group Inbox.
- Tiles/granite/marble product, lot, slab, godown, dealer, quotation, invoice, payment, and dealer-order primitives.

### Partial or not yet connected

- The Evolution ticket only has a generic `open` status; it is not an inquiry lifecycle and is not linked to a `Dealer`, quotation, `DealerOrder`, invoice, payment, or dispatch record.
- Existing follow-up records belong to legacy `Lead` records. They cannot schedule a follow-up against an Evolution group ticket and do not automatically send or cancel a WhatsApp follow-up.
- Existing dashboard KPIs use general leads/orders/invoices. They do not report Evolution-group inquiries, department SLA, conversion, response time, or dispatch countdowns.
- The local `Xenova/multilingual-e5-small` RAG worker is attached to legacy Meta 1:1 `waConversation`/social conversations. Evolution webhooks currently classify routing but do not run the knowledge retrieval, response generation, human-handoff, or Evolution send path.
- Knowledge documents are text-entry/file-indexed; there is no Google Drive/Sheets source connector, catalog-code resolver, or lot-image index.
- The repo still contains legacy Meta/social/old AI paths. They must be isolated from the tiles Evolution deployment so their routes, seed data, and UI cannot accidentally handle a dealer group.
- Dealer orders have dispatch dates and delivery dates, but no first-class logistic receipt/Bilty/LR attachment and no invoice-to-dealer-order relationship.

## Work packages

### 1. Freeze the deployment boundary

1. Keep `BUSINESS_TYPE=tiles` as a required production setting and add a startup assertion that refuses to boot the dealer deployment when it resolves to the furniture vertical.
2. Keep the existing furniture seed branch available only for a separately named furniture deployment/database. Never run a furniture seed against the tiles database.
3. Mark legacy Meta/social API routes and old AI-agent routes as compatibility-only. Hide them from the tiles navigation and add an explicit feature flag/route guard so an Evolution ticket cannot be written to legacy `wa_*` tables.
4. Document the two deployment boundaries: Evolution webhook → `/api/evolution/*` → routing tables, and legacy Meta → `/api/whatsapp/*` only when explicitly enabled.
5. Pin the webhook contract to the deployed Evolution version and explicitly enable/test `MESSAGES_UPSERT`, `SEND_MESSAGE`, `CONNECTION_UPDATE`, `GROUPS_UPSERT`, and participant-update events. Evolution delivers these as event-driven webhooks, so payload fixtures must be versioned rather than inferred from a single live message.

### 2. Define the inquiry and ticket contract

Add a migration that preserves all Dealer, Godown, CustomOrder, Billing, Invoice, Product, StoneLot, and Slab models. Add a business-level inquiry layer rather than overloading a message row:

- `DealerInquiry`: `id`, `groupId`, optional `dealerId`, normalized dealer phone, title, source (`EVOLUTION_GROUP`), stage, priority, `openedAt`, `lastActivityAt`, `slaDueAt`, `nextFollowUpAt`, `closedAt`, `lostReason`, `convertedOrderId`, and audit timestamps.
- `EvolutionGroupTicket`: retain routing fields and add `inquiryId`, lifecycle status/stage, `assignedAt`, `firstResponseAt`, `lastResponseAt`, `resolvedAt`, and `closedAt`.
- `TicketFollowUp`: ticket/inquiry id, assigned user/department, due time, channel, message/template, status (`PENDING`, `SENT`, `SKIPPED`, `CANCELLED`, `FAILED`), attempt count, provider message id, and idempotency key.
- Optional `DealerEvolutionIdentity`: dealer id, normalized WhatsApp group JID/phone, verification state, and last-seen timestamp. Do not treat an unknown sender as an end customer; keep it in an admin-review queue until linked to a dealer.

Use enums or centrally validated constants for stages. The initial state machine should be:

`NEW → TRIAGED → WORKING → QUOTATION → WAITING_FOR_DEALER → CONFIRMED → PAYMENT_PENDING → ALLOCATED → DISPATCH_PENDING → DISPATCHED → DELIVERED → CLOSED`

with `ON_HOLD`, `ESCALATED`, `LOST`, and `CANCELLED` as terminal/side states. Every transition records actor, timestamp, reason, and source message id.

### 3. Connect Evolution routing to local RAG safely

1. Extract group context from the last N text messages plus the current message, excluding media-only messages unless OCR/vision has produced text.
2. Reuse the existing local E5 embedder and chunker in the first implementation; keep the `query:`/`passage:` prefixes and 384-dimension contract.
3. Add an Evolution-specific agent configuration: enabled, allowed departments/groups, confidence threshold, response delay, max tokens, and human-handoff policy.
4. Run retrieval and generation asynchronously after returning a fast webhook acknowledgement. Never block the webhook on an LLM call.
5. Before sending, re-read the ticket in a transaction and stop if a human claimed it, the group was transferred, the inquiry was closed, or a newer outbound response exists.
6. Send replies through `sendEvolutionGroupText`/media helpers, persist the outbound message, provider id, latency, retrieval ids, confidence, and handoff decision, and make retries idempotent.
7. Default to draft/suggestion mode for production groups. Enable auto-reply only for a named test group until acceptance tests pass.

### 4. Add the first Evolution operational metrics endpoint

Create a server action/API used by the dashboard with date and department filters:

- total group inquiries, new/open/closed inquiries;
- inquiries by department and lifecycle stage;
- first-response and resolution median/P95;
- assigned vs unassigned, mentioned/tagged, overdue SLA, and overdue follow-ups;
- quotation/order conversion and lost reasons;
- marketing broadcast sends, delivered/read/replied counts, response rate, and the campaign/group/dealer that generated each response. New Evolution broadcasts must write provider-neutral campaign/response records; legacy `WaBroadcastRecipient` counts may be read as a migration bridge only, not as the write path for Evolution traffic;
- message/media ingestion failures, routing fallback rate, RAG confidence, handoff rate, and Evolution provider errors.

Do not replace the existing CRM dashboard KPIs. Add an Evolution operations panel that is clearly sourced from group-ticket data.

### 5. Tests and operational hardening

- Unit-test JID normalization, routing precedence, dealer identity matching, stage-transition guards, follow-up idempotency, and RAG handoff conditions.
- Integration-test duplicate webhooks, out-of-order events, from-me messages, media download failure, provider timeout, reassignment during generation, and a closed-ticket reply.
- Add a fixture factory that creates tile dealers, groups, lots, and departments only; do not use furniture fixtures.
- Add health checks for app, WebSocket, Evolution, both Redis instances, and database migrations. Alert when the Evolution webhook has not been received for a configured interval.
- Add structured correlation ids: webhook event → message id → ticket id → RAG job id → provider message id.

## Phase 1 acceptance criteria

1. A message in a mapped dealer group creates exactly one message, one ticket update, one inquiry activity, and one audit record even when Evolution retries the webhook.
2. An unknown group/sender is visible to Admin review and cannot be treated as a retail/end-customer lead.
3. Claiming or transferring a ticket while an AI job is running prevents that job from sending an unsolicited reply.
4. A test-group message can retrieve a tile/stone knowledge document locally, produce a cited draft, and hand off when confidence is below threshold.
5. The dashboard reports group inquiries and response/conversion metrics independently of legacy Meta tables.
6. Broadcast response metrics are populated from an auditable Evolution campaign/response record and can be reconciled to provider message ids; legacy Meta tables are not required for new traffic.
6. `npm test`, TypeScript validation, Prisma generation, and a production Docker build pass; migration deploy is repeatable on an existing database.

## Rollout and rollback

- Deploy the additive migration first; backfill only deterministic group/ticket rows and leave dealer links nullable.
- Run in draft-only RAG mode for one test group, then one Sales group, before enabling additional departments.
- Keep a feature flag to disable RAG generation while preserving webhook ingestion and manual inbox operations.

## Phase 1 research references

- [Evolution Foundation webhook documentation](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md) — event names and instance webhook behavior that the payload fixtures must cover.
- Roll back by disabling the new worker/flag and reverting UI reads to the existing ticket tables; do not delete captured messages or audits.
