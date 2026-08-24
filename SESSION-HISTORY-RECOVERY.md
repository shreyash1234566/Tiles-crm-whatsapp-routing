# Session history recovery note

This repository is based on the complete history cloned from `divyanshu9166/Tiles-crm` and keeps that history intact. The current employee-account, authorization, standalone-runtime, database-compatibility, and Group Inbox route changes have been applied on top of that history.

The sandbox reset removed the local `.git` object database that contained the session-only commits. The prior reports record these session commit identifiers: `21d1455` (routing remediation hardening), `049b043` (Evolution runtime environment contract), `f6730ce` (department-aware employee accounts), and `733489b` (standalone client asset serving). Their exact commit objects were not pushed to GitHub and are no longer available locally, so their original hashes cannot honestly be reproduced or attached to the new repository.

The new repository therefore preserves the complete source-repository history and records the restored current state in a new recovery commit. No changes were made to `shreyash1234566/AppNotification` or `shreyash1234566/PersonalBot`.

No environment files, passwords, API keys, OTPs, or private phone numbers are included in this repository.
