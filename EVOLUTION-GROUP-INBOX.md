# Evolution API Group Inbox

Tiles CRM now contains a first-party Evolution API integration boundary for WhatsApp Web group routing. It deliberately keeps the existing Meta Graph API marketing/direct-contact integration intact.

## Architecture

```text
WhatsApp sender phone
  └─ Linked devices → Evolution API instance
       ├─ QR / connection-state API
       ├─ MESSAGES_UPSERT webhook
       └─ sendText group endpoint
             ↓
Tiles CRM `/api/evolution/webhook`
  ├─ verifies the private webhook secret
  ├─ accepts group JIDs only
  ├─ stores group and message idempotently
  ├─ resolves Sales / Accounts / Logistics
  └─ updates Group Inbox ordering and unread state
             ↓
Staff `/routing-crm`
  ├─ sees only their department
  ├─ mention-priority groups appear first
  ├─ claims/releases a group
  └─ replies through Evolution to the same group
```

## Server configuration

Keep the following values in the private server environment, never in browser code or Git:

```dotenv
EVOLUTION_API_URL="https://your-evolution-host"
EVOLUTION_API_KEY="your-private-api-key"
EVOLUTION_INSTANCE_NAME="tiles-crm"
EVOLUTION_WEBHOOK_SECRET="a-long-random-secret"
EVOLUTION_WEBHOOK_URL="https://your-crm-host/api/evolution/webhook"
EVOLUTION_OWNER_USER_ID=""
EVOLUTION_BUSINESS_ALIASES="Tiles CRM,Furzentic"
```

`EVOLUTION_OWNER_USER_ID` is optional in the current single-tenant implementation. If omitted, the first active Admin owns the Evolution inbox. `EVOLUTION_WEBHOOK_URL` is optional when the CRM request origin is already the stable public HTTPS URL.

After setting the values, run the Prisma schema update and restart the CRM. Register the webhook from the Admin Group Inbox using **Register webhook**, or call the Admin endpoint:

```text
POST /api/evolution/webhook/configure
```

The registered webhook receiver is:

```text
POST https://your-crm-host/api/evolution/webhook
Authorization: Bearer <EVOLUTION_WEBHOOK_SECRET>
```

## Pair the WhatsApp sender

1. Start the persistent Evolution API instance and create the named instance.
2. Open Tiles CRM as Admin and go to **Group Inbox**.
3. Click **Show QR**. Tiles CRM requests the QR from Evolution at `/instance/connect/{instance}` and renders the returned image when Evolution supplies a base64 QR.
4. On the sender phone open **WhatsApp → Settings → Linked devices → Link a device** and scan the QR.
5. Keep the Group Inbox open until its status changes to **WhatsApp connected**.
6. Click **Register webhook** once the server has a stable public HTTPS URL.

Logging out the phone from Linked devices later is safe for a test, but it disconnects Evolution and stops inbound messages until the phone is paired again.

## Department routing behavior

The CRM accepts group messages only when the remote JID ends in `@g.us`. Direct WhatsApp chats are ignored by this route. A group is assigned in this order: an existing active mapping is preserved; a direct mention of an active department recipient is considered; the group subject/message is checked for the department name; and active recipient aliases are checked. If no department matches, the group remains in Admin review rather than being silently dropped.

A group is placed above ordinary groups when the current message directly mentions a configured recipient, contains a configured business alias, or matches an alias that is treated as a call/mention. The remaining order is unread count, latest message time, and creation time. Admin and Manager can view all groups; Staff can view only groups belonging to their active routing department.

## Controlled test

Use a temporary test group, not a production dealer/customer group. The group should contain the paired Evolution sender, one real authorized recipient for the target department, and a second human participant who sends the test message. The second participant must send the inbound test; messages sent by the paired sender are stored as outbound echoes and are not treated as new department work.

Run one department at a time. A Sales message must appear only for Sales Staff; Accounts and Logistics must not see it. Reply from the Sales CRM composer and confirm the reply arrives in the same WhatsApp group. Repeat for Accounts and Logistics. Then test an unmatched message, a direct business-name mention, a duplicate webhook delivery, a reconnect, an unauthorized webhook request, and Admin visibility.

## Important limitations

The four fictional test accounts and `202-555` phone values cannot receive WhatsApp notifications. They validate account login and department authorization only. Real routing notifications require real authorized employee phones.

This integration stores text and provider media URLs. Full media download/proxy handling, message reactions, typing indicators, and full WhatsApp parity are not yet included in the first Group Inbox slice. The existing Meta direct-contact UI and APIs remain separate and are not replaced by this Evolution group workflow.

## Provider choice

This implementation targets the official Evolution API/Baileys REST contract because the earlier QR experiment and the current Tiles environment contract were built around it, and its ecosystem has the broader documented group, webhook, and Manager surface. Evolution Go is a separate Go/whatsmeow engine with its own API and license-activation lifecycle. It may be evaluated later as a deliberate migration, but it should not be mixed into this instance because that would introduce a second QR/session and payload contract.

## Original routing decision order restored

For each inbound group message, Tiles CRM now applies this order:

1. An explicit WhatsApp `@` mention or employee/profile alias routes directly to that employee and department with highest priority.
2. A department name or configured employee alias in the subject/message routes deterministically by keyword.
3. If no deterministic keyword matches, Groq is called with a strict JSON classification prompt. A result is accepted at confidence `>= 0.70`.
4. If Groq is absent, low-confidence, invalid, or unavailable, Claude Haiku is called when `ANTHROPIC_API_KEY` is configured.
5. If both classifiers are unclear or unavailable, an existing open group keeps its department; a new group goes to the default Sales department so no message is silently dropped.

Every processed message creates or updates one `EvolutionGroupTicket`. Each route is recorded in `EvolutionRoutingAudit`; a change from one department ID to another is recorded as `HANDOFF`. The database transaction writes the group, ticket, message, and audit together, while the webhook acknowledges quickly and performs the work asynchronously.
