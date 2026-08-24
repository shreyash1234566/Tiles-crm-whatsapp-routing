# Internal Server Error fix verification

The public login request initially returned HTTP 500 because the recovered runtime was missing the routing fields expected by the employee-account login code. Prisma reported `Unknown field routingDepartmentId for select statement on model User`; the public clone had the older schema while the employee-account code expected routingDepartmentId, routingPhone, routingAliases, and the RoutingDepartment relation.

The schema was restored with those fields, Prisma client generation completed, a disposable local PostgreSQL database was created, Tiles schema was pushed, and the documented demo Admin seed was applied.

The public Admin login was then tested end to end in the browser with the documented local demo credentials. The login redirected to `/` and displayed the Tiles CRM dashboard with the authenticated Administrator session. The server-side API test also returned HTTP 200 with `redirectTo: "/"`, and the current-user API returned HTTP 200. The test environment uses synthetic local database data only; no real staff, phone numbers, passwords, or WhatsApp accounts were added.

The public browser test was repeated after the fix: Admin login with the documented demo seed account reached the authenticated dashboard at `/`. From the dashboard, Settings opened successfully, and the Team section opened successfully with an empty team list and an available Invite/Add Employee control. No real employees or routing recipients were created during this test.

The authenticated browser test then opened Settings → Team and the Invite/Add Employee form. Clicking Add Team Member with all identity fields empty triggered native required-field validation and did not create a record. This confirms the provisioning form is interactive and protects against incomplete account creation.

After rebuilding and restarting, the authenticated public browser opened `/routing-crm` successfully. The page displayed Group Inbox, Sales/Accounts/Logistics empty states, and configuration links instead of a 404. Clicking Refresh kept the page available.
