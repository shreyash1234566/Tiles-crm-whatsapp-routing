# Phase 2 — Dealer group operations and fulfillment workflow

## Objective

Turn the Group Inbox into the team’s daily operating console: Sales, Accounts, Logistics, and Warehouse can see only the work relevant to them, hand work off without losing context, follow up for two to three days, convert an inquiry into a dealer order, and communicate payment and dispatch milestones back to the same WhatsApp group.

## Starting point

Phase 1 provides the inquiry/ticket contract, safe group RAG, dealer identity boundary, and metrics foundation. This phase builds the user-facing workflow and connects it to the existing dealer, quotation, billing, payment, godown, lot, and slab modules.

## Work packages

### 1. Build a complete ticket state machine

Expose lifecycle controls in the Group Inbox and enforce transitions server-side:

- `NEW`: inbound inquiry not yet triaged.
- `TRIAGED`: department and dealer identity confirmed.
- `WORKING`: an employee is actively handling it.
- `QUOTATION`: product/lot options or a formal quotation are being prepared.
- `WAITING_FOR_DEALER`: dealer confirmation or missing details.
- `CONFIRMED`: dealer accepted the offer.
- `PAYMENT_PENDING`: advance QR payment or approved credit terms are outstanding.
- `ALLOCATED`: lot/slab/box stock reserved in a godown.
- `DISPATCH_PENDING`: material is ready and transport details are pending.
- `DISPATCHED`: transport has collected the material and LR/Bilty is attached.
- `DELIVERED`: delivery confirmation recorded.
- `CLOSED`: completed and no further action.
- Side states: `ON_HOLD`, `ESCALATED`, `LOST`, `CANCELLED`.

Show the current stage, owner, department, SLA timer, next follow-up, and last customer/dealer activity in both the list and conversation header. Restrict stage changes by role: Sales can triage/quote, Accounts can verify payment, Warehouse can allocate, Logistics can dispatch, and Admin/Manager can override.

### 2. Department queues, assignment, and handoff

- Add queue filters: My tickets, My department, Unassigned, Mentioned me, Mentioned my role, SLA overdue, follow-up due, payment pending, dispatch pending, and closed.
- Preserve the existing explicit `@employee`/alias priority. Add a visible “why routed here” explanation and an audit link.
- Support claim, release, assign-to-user, assign-to-department, and transfer-with-note. The receiving team gets a notification and an unread counter.
- On handoff, carry the complete message history, dealer profile, product/lot context, quotation/order/payment links, current stage, and unresolved checklist. Never create a second ticket for the same group inquiry without an explicit split action.
- Add optimistic locking/version checks so two staff members cannot silently overwrite a claim or handoff.
- Ensure STAFF users can access only their department/assigned tickets; ADMIN/MANAGER can access all tickets; all access decisions are server-side.

### 3. Follow-up automation for the 2–3 day sales cycle

- Add a “next action” panel with one-click schedules for 24 hours, 48 hours, 72 hours, custom date, or “dealer replied—cancel pending follow-up”.
- Create `TicketFollowUp` rows with a unique `(ticketId, scheduledFor, idempotencyKey)` constraint.
- Run a BullMQ/cron worker that sends only due, still-open follow-ups. Re-check ticket stage, owner, newer dealer message, and quiet hours immediately before sending.
- Support a manual message draft and approved template variables: dealer name, inquiry subject, quoted code, pending decision, and owner name.
- Retry provider failures with exponential backoff; record `SENT`, `FAILED`, and provider ids. Never duplicate a follow-up after a worker restart.
- Escalate an unanswered inquiry after the third attempt to the Sales Manager and mark it `ESCALATED` rather than endlessly messaging the group.
- Surface overdue follow-ups on the dashboard and staff portal, with snooze and complete actions.

### 4. Dealer-only identity and context

- Match WhatsApp sender phone numbers to `Dealer.phone`/`whatsappNumber` after normalization; allow an Admin to confirm or merge a match.
- Display business name, contact person, city/state, GSTIN, price tier, credit days/limit, open claims, outstanding balance, recent orders, and previous quoted codes beside the group chat.
- Keep dealer margins and internal cost rates strictly internal. Only approved dealer rates and allowed product details may be sent to WhatsApp.
- Add “create dealer from this group” and “link existing dealer” actions. Require a dealer link before advancing to `CONFIRMED` unless an Admin explicitly overrides.

### 5. Quote → order → payment → dispatch integration

Reuse the existing Dealer and B2B order primitives rather than creating a parallel order system:

1. From the ticket, select product/SKU, unit (`BOX`, `SQFT`, `SLAB`), quantity/area, lot/shade, photos, dealer price list, discount, GST, freight, and loading.
2. Generate a quotation or dealer order with a full immutable price snapshot. Preserve the dealer’s margin/price tier and the internal cost/margin fields.
3. Link the resulting `DealerOrder` to the inquiry and, where an invoice is issued, link `Invoice.dealerOrderId` back to the dealer order. Do not remove existing invoice/contact relationships.
4. Apply payment terms: advance QR/UPI or credit days/limit. Accounts marks payment verified and records reference/receipt evidence.
5. Warehouse allocates actual tile boxes or stone lots/slabs and records reserved quantities, shade approval, and godown location.
6. Logistics records transporter, vehicle/LR number, dispatch time, expected delivery, and an uploaded Bilty/LR image or PDF. Add `logisticReceiptUrl`, `lrNumber`, `transporterName`, `transportContact`, and `dispatchNotes` additively to the dealer-order/dispatch model.
7. Send a controlled WhatsApp update for quote shared, payment received, allocation confirmed, dispatched, and delivered. Store each outbound provider message id and link it to the stage transition.

### 6. Fulfillment countdown and operations dashboard

Add a dispatch board with cards grouped by `PAYMENT_PENDING`, `ALLOCATED`, `DISPATCH_PENDING`, `DISPATCHED`, and `DELIVERY_DUE`:

- Countdown is computed from `expectedDispatchDate` or committed delivery date, using the server timezone and a clear “due today/overdue” state.
- Show dealer, display id, total, payment status, godown/lot allocation, salesperson, logistics owner, and days remaining.
- Provide filters for department, godown, salesperson, overdue, and date range.
- Add dashboard KPIs for group inquiries received, quote response time, conversion to dealer orders, advance/credit split, pending allocation, dispatches due in 1/3/7 days, overdue dispatches, delivery status, and LR/Bilty completion.
- Add broadcast-response attribution to the same dashboard: campaign, target dealer/group, sent/delivered/read/replied, response rate, and replies that became inquiries or orders. Keep this separate from ordinary inbound group messages so a dealer replying to a broadcast is not double-counted.
- Keep existing general CRM KPIs and tile stock/lot alerts; the new cards must be sourced from dealer/Evolution records.

### 7. Message and media quality

- Render images/videos/audio/documents with filename, MIME type, size, upload timestamp, and download fallback.
- Validate allowed outbound types and size limits before calling Evolution; show provider errors in the composer rather than a generic “operation aborted”.
- Add quote/reply support where the Evolution payload contains a quoted message id.
- Persist inbound and outbound media metadata so a media URL can be rehydrated after container restart.

## Phase 2 acceptance criteria

1. A Sales employee can receive a routed dealer inquiry, claim it, schedule two follow-ups, prepare a tile/stone quote, and see the follow-ups cancelled automatically when the dealer replies.
2. A manager can hand the ticket to Accounts, Accounts can mark advance/credit verification, Warehouse can allocate a lot/slab, and Logistics can attach a Bilty/LR and mark dispatch without losing the group history.
3. The same inquiry is traceable from WhatsApp message → ticket → dealer → quotation/order → invoice/payment → allocation → dispatch/LR → delivery.
4. Staff filters show only permitted queues and tagged/assigned work; Admin can audit every transition and handoff.
5. The dashboard shows an accurate 1/3/7-day fulfillment countdown and separates overdue dispatch from overdue payment.
6. Provider failures, duplicate sends, permission failures, and concurrent claims have automated tests and user-visible recovery paths.

## Rollout and rollback

- Release queue/filter UI first with read-only lifecycle data, then enable mutations by role.
- Backfill dealer links only when phone/group matching is unambiguous; send ambiguous rows to Admin review.
- Enable follow-up sending in dry-run/log-only mode for one week, then enable Sales test groups, then all departments.
- Keep the old dealer order and billing screens available while the ticket side panel is introduced. Roll back UI actions without deleting the additive audit/dispatch data.
