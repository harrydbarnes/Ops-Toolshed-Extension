# Guarded tracker write pilot

## Current live setup

The new service is deployed as Harry / DOMAIN (Google UI: Anyone within groupm.com).
All requests additionally require a Google-identified email enabled in the private
server registry. Twenty unique addresses from Harry's supplied list are stored
there, with Steve's duplicate removed and the three groupm.com aliases retained.
The registry is never sent to the extension. No names/email list is in the ZIP.

This is a pilot, not a general tracker writer. Only TESTER_EMAIL can run the test.
One fixed placement is matched afresh by D03120200, campaign CP3G9KS and booking
end 06/09/2026. The client cannot choose a sheet, placement or arbitrary range.
The original must still be No and not a formula. The server previews without
writing, issues an identity-bound two-minute one-use token, and then performs
No -> Yes -> No with readback and restoration in finally. WRITE_TEST_ENABLED is
switched off before the round trip so a second run requires private re-arming.

## Harry: run the installed-extension test

1. Extract ops-toolshed-guarded-write-pilot.zip into a new folder.
2. Open chrome://extensions > Developer mode > Load unpacked. Select the extracted
   folder itself: manifest.json is at its root. This is a separate extension; it
   does not require replacing Ops Toolshed or the identity pilot.
3. Open Ops Toolshed — Guarded Write Pilot from Chrome's Extensions menu.
4. Click Check my access. No typed email, configuration or URL is required.
5. Click Prepare write test. It reads and previews the exact row; no write yet.
6. Confirm the preview shows D03120200 / September 2026 / original No. Keep the
   popup open, tick the confirmation and click Run No -> Yes -> No test within
   two minutes. During this short test, avoid editing/sorting the tracker.
7. Expected result: yesConfirmed:true and restored:true. Download result (.json)
   and send it to Codex. The test automatically disables itself after this run.
8. Independently reload the tracker and confirm that placement's Reccied is No.
   If the test reports a timeout, do not retry blindly: the server may still be
   restoring. If it reports RESTORE_FAILED_CHECK_TRACKER, inspect the placement
   immediately. No test failure should be treated as a reconciliation confirmation.

The next live test is specifically from the installed extension worker. Prior
editor-based writes and this service's live GET/revocation tests do not prove it.
No spreadsheet cells were changed while setting up this service.

## Manage access remotely — no extension reinstall

Open the private project settings:
https://script.google.com/home/projects/1_DFtD4daedPh3Pq6UCdus7NwId0QIggdytULCVSuLj8O5e0ZKYNJuNUn/settings

Under Script properties choose Edit script properties:

- Enable a person: property ALLOW_their.email@domain with value true (lowercase email).
- Revoke a person: change their value to false, or remove that ALLOW_ entry.
- Add a person: Add script property, enter the ALLOW_ key and true, then Save.
- Leave ACL_INITIALIZED and TESTER_EMAIL unchanged during the pilot.
- Emergency stop: set WRITE_TEST_ENABLED to false and Save. This blocks new test
  preparations/commits; an already-started restoration must still finish.

Every request reads this list without caching. Google returns the caller's primary
email; the provided aliases are separate entries, not assumed identity equivalences.
Only project editors can manage properties; colleagues get the web app, not editor
access. Changes affect the next request, without a new deployment or extension.

## Evidence and limits

- 22 October 2026: new backend created separately from the original tracker script
  and identity pilot. Explicit user consent granted for the domain-restricted
  guarded deployment and account-email/full Sheets OAuth scopes.
- One-time private setup logged configuredUsers:20 and writeTestEnabled:false.
  Seed source was removed before deployment; live server Code.gs matched local
  reviewed source exactly.
- Version 1 deployed 16:37 local. Live GET identified Harry with allowed:true.
  Temporarily setting Harry's ALLOW_ value false returned ACCESS_DENIED immediately;
  restoring it returned allowed:true. Harry-only test then armed, testEnabled:true.
- Server tests cover unlisted/blank identities, immediate revocation, lock races,
  wrong-user tokens, formula/duplicate/missing matches, restoration and failures.
- SpreadsheetApp writes do not invoke the original onEdit trigger. The pilot emits
  structured execution logs, not a production durable audit trail.
- ScriptLock serialises this service only; it does not lock manual spreadsheet
  edits or unrelated scripts. This controlled test is not production concurrency
  proof. It is not an automatic Prisma-verified reconciliation write.
- Worker tokens are held only in memory. If Chrome stops the worker, prepare again;
  a missing token never grants permission. No retries of write requests are automatic.
- The earlier private writer and tracker scripts remain unchanged. No scheduled,
  automatic, campaign-wide or permanent-Yes operation is exposed by this service.

## Distribution

Only extension/ runtime files and this README are included at the ZIP root.
server/Code.gs and SeedAccess.gs are not shipped. config.js contains the service URL,
which is not a secret; Google identity plus the private registry enforce access.
Downloaded results contain the requesting work email and test outcome, not tokens
or the access list. Share results internally and with Codex for this task only.
