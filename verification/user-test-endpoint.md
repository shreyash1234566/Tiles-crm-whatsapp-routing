# User test endpoint

The complete recovered Tiles CRM was rebuilt successfully and started from `/home/ubuntu/Tiles-crm-recovered` using the standalone production server on port 3000.

Public endpoint: https://3000-ivg54ha0p3n444vpon9gw-5d15ca72.us3.manus.computer

Verification: `/login` returned HTTP 200 through the public endpoint. The browser loaded the styled login chooser, and clicking Staff opened the Employee Email and Password form. The unauthenticated `/staff-portal` route redirects to `/login` as designed.

Operational limitations: Redis is unavailable in the sandbox, so background workers and real-time events are disabled. No database credentials are configured in the recovered runtime, so real account login and data-backed CRM workflows require the owner’s configured database and employee credentials. No real identities, passwords, phone numbers, or WhatsApp accounts were created.
