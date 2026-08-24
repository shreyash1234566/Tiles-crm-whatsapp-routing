# Tiles CRM: A-to-Z Testing Guide

## 1. First understand what can be tested right now

There are two different tests:

| Test level | What it proves | What you need |
|---|---|---|
| Browser/interface test | Login screen, buttons, page navigation, validation, and layout | The temporary link below; no credentials needed |
| Full application test | Real Admin login, employee creation, department landing, CRM data, and WhatsApp routing | A database, session secrets, real employee data, and—only for WhatsApp—a persistent Evolution API setup |

The temporary browser link is:

> **https://3000-ivg54ha0p3n444vpon9gw-5d15ca72.us3.manus.computer/login**

I verified that this link loads the styled login page and that clicking **Staff** opens the **Employee Email + Password** form. The link is temporary and the current sandbox runtime has no configured database or Redis service. Therefore, it is suitable for interface testing, but it is not a complete real-login or live-WhatsApp environment.

Do not send any real password, OTP, database URL, API key, or personal phone number in this chat. Enter those values only in your private `.env.tiles` file or in the private site form.

## 2. The exact account model

Tiles CRM has three separate concepts that must not be mixed:

| Field | Meaning |
|---|---|
| Employee name | The real person’s HR/profile name |
| Job title | The person’s work profile, such as Accountant, Logistics Coordinator, Sales Executive, or Manager |
| Permission role | What the account can do: `STAFF`, `MANAGER`, or `ADMIN` |
| Routing department | Where WhatsApp group tickets are routed: Sales, Accounts, or Logistics |
| Routing phone | The real authorized WhatsApp number that receives routing notifications for that employee |
| Login email/password | The employee’s private account credentials |

An employee’s **job title does not have to equal the routing department**. For example, a person whose job title is “Finance Manager” can be routed to Accounts, while a person whose job title is “Operations Executive” can be routed to Logistics.

The paired WhatsApp number used by Evolution is the CRM’s WhatsApp sender. The employee routing phone is the recipient phone. For a real group test, a second human should send the test message from a different WhatsApp number in a temporary test group. Do not use a production dealer/customer group.

## 3. Full local setup without Docker

### 3.1 Install the required software

Install Node.js 22 or newer and Git on your computer. You also need PostgreSQL. You can either install PostgreSQL locally or create a private PostgreSQL database with a managed provider and copy its connection string. Redis is optional for the first login/account test, but it is required for realtime events and queue workers.

For the first test, PostgreSQL is the only mandatory external service. Evolution API, Redis, WebSocket service, LiveKit, AI keys, and WhatsApp are not needed to test Admin login, employee creation, and department landing.

### 3.2 Obtain the exact tested project source

Use the project archive supplied with this guide if available. It contains the employee-account implementation and the standalone asset-serving fix that was tested. Do not rely on an old clone of `main` if it does not contain the employee-account changes.

If you are using a Git checkout that contains the tested files, open PowerShell or Terminal in the project directory and run:

```bash
npm install
npx prisma generate
```

### 3.3 Create the Tiles environment file

Copy the example file:

```bash
# macOS/Linux/Git Bash
cp .env.example .env.tiles

# Windows PowerShell
Copy-Item .env.example .env.tiles
```

Open `.env.tiles` and set at least these values:

```dotenv
DATABASE_URL="paste-your-private-postgresql-connection-string-here"
BUSINESS_TYPE="tiles"
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SESSION_SECRET="generate-a-private-secret-at-least-32-characters-long"
CRM_API_SECRET="generate-another-private-secret"
CRON_SECRET="generate-another-private-secret"
AUTOMATION_CRON_SECRET="generate-another-private-secret"
ENCRYPTION_KEY="64-lowercase-hex-characters"
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_WS_URL="ws://localhost:3001"
```

You can generate safe random values locally. For example, with Git Bash or macOS/Linux:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Use the first four generated values for the session/API/cron secrets. For `ENCRYPTION_KEY`, use one generated 64-character hexadecimal value. Never commit `.env.tiles` or paste its contents into chat.

If Redis is not installed yet, you may leave it unset or use the placeholder only for the first database/account test. The application will report that realtime and background workers are disabled; this does not prevent the basic login test.

### 3.4 Prepare and seed the Tiles database

For a new empty database, run:

```bash
npm run setup:tiles
```

This generates the Prisma client, creates the database tables, and seeds the Tiles vertical. If you prefer separate commands, run:

```bash
npx prisma generate
dotenv -e .env.tiles -- prisma db push
dotenv -e .env.tiles -- tsx prisma/seed.ts
```

The Tiles seed creates this **demo-only Admin account**:

| Login field | Demo value |
|---|---|
| Email | `admin@tilescrm.com` |
| Password | `admin123` |
| Permission | Admin |

These are fixture credentials from the seed code, not a real owner identity. Use them only in a private local test database. Change or replace them before any real deployment.

### 3.5 Start the site

For normal development:

```bash
npm run dev:tiles
```

Open:

```text
http://localhost:3001/login
```

The Tiles development script uses port `3001`. If you want the production-style asset-serving test on port 3000, run:

```bash
npm run build
npm run start
```

Then open:

```text
http://localhost:3000/login
```

The build now copies `.next/static` and `public` into the standalone runtime. Without that step, the HTML appears but buttons do not respond because the browser cannot load the React JavaScript bundle.

## 4. Test Admin login first

Open the login page and select **Admin**. Enter:

```text
Email: admin@tilescrm.com
Password: admin123
```

Click **Sign In**. A successful Admin login must take you to `/`, the main dashboard. It must not return you to the role chooser or redirect you to `/staff-portal`.

Then test these controls:

| Control | Expected result |
|---|---|
| Sidebar navigation | The destination page opens without a blank page or 404 |
| Settings | Opens for Admin and shows the Team area |
| Staff Portal sidebar item | It is intentionally shown to Staff accounts, not the Admin navigation; Admin access to the overall CRM remains intact |
| Logout | Returns to `/login` and removes the session |

If Admin login returns “Internal server error,” check `DATABASE_URL`, confirm the database exists, and rerun `npx prisma generate`. Do not create random accounts until the database connection is corrected.

## 5. Create a real employee account

From the Admin account, open:

```text
Settings → Team → Add Employee
```

Enter the real employee’s information. For the first safe test, use a real employee who has agreed to test, or use a clearly labeled temporary test person whose data you control. Do not invent a real employee identity or phone number.

### 5.1 Safe Staff Portal test

To verify that an employee opens the Staff Portal:

| Form field | What to enter |
|---|---|
| Name | The employee’s real name |
| Job title | Their real job profile |
| Work phone/email | Their actual HR contact values as appropriate |
| Join date | Their real or test join date |
| Login email | A private email address controlled by that employee |
| Temporary password | At least 8 characters; share it privately, not in this chat |
| Permission role | `Staff` |
| Routing department | Leave blank for this first Staff Portal test |
| Authorized routing phone | Leave blank when no routing department is selected |
| Aliases | Optional alternate names used by the organization |

Save the employee. The Team table should show the account as linked and ready for login. The password itself must never appear in the Team table or API response.

### 5.2 Test Staff Portal login

Open a private/incognito browser window so the Admin session cannot be reused. Open the login URL and select **Staff**. Enter the employee’s private login email and the temporary password assigned by Admin.

Expected result:

```text
Successful Staff login → /staff-portal
```

The Staff Portal must load the profile linked to the authenticated session. There must be no public employee-name selector and no possibility to choose another employee’s profile.

Test the following non-destructively first:

| Staff Portal check | Expected result |
|---|---|
| Employee name/header | Shows the logged-in employee’s profile |
| Department header | Shows “Department not assigned” for this first test |
| Tabs | Dashboard, Stock Updates, Assigned Visits, Self Visits, My Attendance, and My Sales respond |
| Admin-only pages | Staff cannot open Admin-only pages |
| Logout | Returns to login |

Only after confirming the read-only/profile experience should you test clock-in, stock updates, visits, or uploads with real business data and owner approval.

## 6. Test automatic department landing

Create or edit a second real employee account, or reuse the first account after recording its initial state. Set:

```text
Permission role: Staff
Routing department: Accounts or Logistics or Sales
Authorized routing phone: the employee’s real authorized WhatsApp number
Login email: the employee’s private email
Password: at least 8 characters
```

The server enforces this invariant:

> A routed Staff employee must have a linked active employee profile, an active routing department, a login email/password, and an authorized routing phone.

Log in from a private browser window with that employee’s email and password. Expected result:

```text
Active Staff + active routing department + authorized phone → /routing-crm
```

The employee should see the Group Inbox filtered to the authorized department. A Staff employee without a routing department should go to `/staff-portal` instead.

Also test the fail-closed cases using a non-production test account:

| Change made by Admin | Expected result on next protected request/login |
|---|---|
| Disable the User account | Login and protected requests are rejected |
| Set Staff status to Inactive | Employee login is rejected |
| Deactivate the routing department | The account must not continue routing into that department |
| Remove the Staff link | The employee profile cannot be opened through the Staff Portal |
| Enter another employee’s Staff ID in a request | Server rejects the request; the client cannot substitute identity |

## 7. Test permission roles

Use separate controlled accounts for these checks:

| Permission role | Expected access |
|---|---|
| Admin | Full CRM and Settings access; dashboard landing `/` |
| Manager | Management access allowed by the existing route policy; dashboard landing `/` |
| Staff without department | Employee profile, Staff Portal, and permitted staff workflows; landing `/staff-portal` |
| Staff with active department | Department Group Inbox and permitted staff workflows; landing `/routing-crm` |

Managers must not be able to create or promote another account to Admin or Manager through the Team UI. Only an Admin should provision elevated permission roles.

## 8. WhatsApp routing test: prerequisites before sending anything

Do not start this section until Admin login, employee creation, and department landing are successful.

You need all of the following:

| Requirement | Why it is required |
|---|---|
| A persistent Evolution API service | The CRM needs a running WhatsApp bridge that remains online |
| A connected WhatsApp instance | The paired phone is the CRM sender |
| `EVOLUTION_API_URL` | URL reachable by the CRM server |
| `EVOLUTION_API_KEY` | Server authentication to Evolution |
| `EVOLUTION_INSTANCE_NAME` | Exact connected instance name |
| `EVOLUTION_WEBHOOK_SECRET` | Authentication for inbound webhook validation |
| Public HTTPS webhook URL | Evolution must reach the CRM from outside the local network |
| PostgreSQL | Stores groups, messages, tickets, users, and assignments |
| Redis | Required for queue workers and realtime events in the full topology |
| One real employee per tested department | Do not invent Accounts or Logistics recipients |
| Authorized employee routing phone | Used as the department recipient destination |
| A second human WhatsApp participant | Sends the test message; must not be the paired CRM sender |
| Temporary test group | Prevents accidental production dealer/customer messages |

The paired Evolution phone and the second participant’s phone must be different. The employee recipient phone must be an actual authorized number. If Accounts or Logistics currently has zero real recipients, the correct state is **not ready**; do not create fake recipients to make the count look complete.

### 8.1 Configure the runtime

Add the real WhatsApp values only to the private runtime environment:

```dotenv
EVOLUTION_API_URL="https://your-private-evolution-host"
EVOLUTION_API_KEY="your-private-evolution-api-key"
EVOLUTION_INSTANCE_NAME="your-connected-instance-name"
EVOLUTION_WEBHOOK_SECRET="your-private-webhook-secret"
```

Also ensure the CRM’s public URL and webhook configuration use the same externally reachable HTTPS origin. Do not use a localhost-only URL for a third-party webhook.

### 8.2 Configure recipients in Admin

For each tested department:

1. Open Settings → Team.
2. Edit the real employee.
3. Set Permission role to Staff.
4. Set Routing department to exactly Sales, Accounts, or Logistics.
5. Enter the real authorized routing phone in the accepted international format.
6. Add aliases only if the employee is genuinely known by those aliases.
7. Save and refresh the Team table.
8. Confirm the readiness indicator says the account is ready.

Do not use the Evolution sender number as a fake employee recipient. Do not use a production group.

### 8.3 Send one controlled group message

Create a temporary WhatsApp group containing:

- The paired Evolution/CRM sender phone.
- One real employee recipient for the target department.
- A second human participant who will send the test message.

From the second participant, send one clearly labeled test message. Do not send it from the paired CRM sender number.

Expected sequence:

```text
Second human sends message
→ Evolution receives it
→ Evolution calls the CRM webhook
→ CRM verifies the webhook and group provenance
→ CRM classifies/routes the ticket
→ Department inbox shows the ticket
→ Authorized employee receives the routing notification
→ Employee can claim/reply according to permissions
```

Verify the group ID, message ID, routing department, notification status, and recipient status in the CRM UI/logs. Do not repeatedly resend messages if the first test fails; inspect the first event and error before retrying.

## 9. How to classify a failed test

| Symptom | Likely layer to inspect |
|---|---|
| Page looks unstyled and buttons do nothing | Standalone assets are missing; run `npm run build` with the asset preparation step, then restart |
| Login page does not load | Runtime/server or route issue |
| Admin login says invalid credentials | Seed/account/database mismatch |
| Login returns internal server error | Missing/incorrect `DATABASE_URL` or Prisma client generation |
| Staff login succeeds but shows profile-not-linked | User is not linked to an active Staff record |
| Routed Staff lands in Staff Portal | Department is absent/inactive, phone is missing, or account state is stale/invalid |
| Group message never appears | Evolution connection, public webhook, secret, or provenance problem |
| Ticket appears but no employee notification | No active authorized recipient for that department, or routing phone is invalid/unavailable |
| Realtime UI does not update | Redis/WebSocket service is unavailable; refresh and inspect queue/runtime logs |

## 10. Final pass/fail checklist

Do not mark the whole system “100% working” until every applicable row is passed:

| Check | Pass condition | Status to record |
|---|---|---|
| Build | Production build completes and prepares standalone assets | Pass/Fail |
| Browser hydration | Buttons and forms respond | Pass/Fail |
| Admin login | Admin reaches `/` | Pass/Fail |
| Employee creation | Admin can save a real employee profile and account | Pass/Fail |
| Private Staff login | Employee uses email/password without public name selection | Pass/Fail |
| Unrouted Staff landing | Employee reaches `/staff-portal` | Pass/Fail |
| Routed Staff landing | Employee reaches `/routing-crm` for an active configured department | Pass/Fail |
| Fail-closed authorization | Disabled/inactive/unlinked states are rejected | Pass/Fail |
| Department isolation | Staff sees only authorized department work | Pass/Fail |
| WhatsApp inbound | Second human’s group message reaches CRM | Pass/Fail |
| Assignment notification | Real authorized recipient receives notification | Pass/Fail |
| WhatsApp reply | Reply is sent only after the intended claim/permission flow | Pass/Fail |

## 11. Important security and operational rules

Never put real passwords in screenshots, source code, Git commits, issue trackers, or chat messages. Use a temporary password for first login and change it through the approved Admin process. Never invent an Accounts or Logistics person, email, routing phone, OTP, or WhatsApp account just to make a readiness indicator turn green.

The sandbox testing link is temporary and is not durable production hosting. For real WhatsApp operation, use a persistent Evolution/API host and a stable HTTPS CRM URL. The browser UI can be tested without WhatsApp, but live group routing cannot honestly be marked complete until the external WhatsApp prerequisites and real department recipients are configured.

## References

[1]: https://github.com/divyanshu9166/Tiles-crm "Tiles CRM repository"
