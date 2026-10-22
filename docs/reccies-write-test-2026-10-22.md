# Reccie tracker write test — 22 October 2026

## Verified result

Spreadsheet: Ops Reccie Tracker
URL: https://docs.google.com/spreadsheets/d/1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU/edit?gid=405487495#gid=405487495
Tab: Reccie report
Cell: Q208 (Reccied)
D number: D03120200
Campaign ID: CP3G9KS
Booking End Date: 06/09/2026
Original dropdown value: No
Allowed dropdown values observed: No, Yes

With the user's express permission, changed Q208 from No to Yes through the
signed-in Google Sheets dropdown. Observed the native save POST return HTTP 200
and the document status become Saved to Drive. No request credentials or save
payloads were copied or retained.

Immediately restored Q208 to No using the same dropdown. Reloaded the spreadsheet
and reselected the cell: No persisted and the document reported Saved to Drive.
Read B208:U208 and compared B:Q against the captured original B:Q values: identical.
Derived helper values R208=0 and S208=1 were present after restoration.
No other cell was edited. Google edit/version history will retain the two test
edits; the test does not erase audit history. Existing dropdowns and formatting
were not deliberately changed. No Prisma financial update was submitted.

Restoration screenshot:
C:/Users/harry.barnes/.codex/visualizations/2026/10/20/01a159af-627d-7a20-89a7-624dc07e1949/reccie-q208-restored-2026-10-22.png

## Proof boundary

This proves browser-session editing, not extension background write access.
The Google Drive connector's Sheets metadata request returned 403 permission
denied for this work spreadsheet. The signed-in Chrome work account had edit
access. These are different access paths.

The extension currently has no identity permission, OAuth client configuration,
Sheets API writer or Apps Script write service. Its Google path reads CSV.
Google's native save endpoint was observed for diagnosis only; it is not a
supported write integration or a recommendation to replay browser save traffic.
A supported authenticated Sheets API or authenticated Apps Script write path
must be configured and tested before sidebar checkboxes can claim to save.

## Implementation stages

1. Manual marking: one D number, or a reviewed explicit list/count of D numbers
   in a campaign. Rematch live sheet rows by D number, campaign ID and report
   month before changing only Reccied. Preserve existing Yes and validation.
   A manual mark represents the user's attestation; do not call it Prisma-verified.
   Show per-row updated/already-Yes/skipped/failed results and reread the tracker.
2. Opt-in write after verification: only a fresh unique Prisma match with
   okToPay='1' AND buyStatus='SUCCESSFUL' qualifies. Never mark from an unchecked,
   duplicate, missing, failed or ambiguous result. Never automatically reverse Yes.
3. Post-financial-update automation: first identify the real accepted update event
   without submitting a financial change solely for testing. Persist a campaign/
   month job with a roughly three-minute due time using extension alarms, then
   query Prisma. The timer alone never qualifies a row. Use the same verified
   writer, deduplicate repeated events, respect feature-off and write opt-in,
   and keep a local result log. The live Prisma tab was already controlled by
   another browser session, so no event-capture test was attempted there.

No write-back or automation feature was enabled by this investigation.

## Follow-up: actual server-side write (10:21:54–10:21:58)
After explicit user approval of the private test project's Sheets scope, Apps Script wrote Reccie report!Q208 (D03120200) No -> Yes -> No. The script confirmed Yes before restoring and reported restored:true. Independent sheet reload showed Q208 No / Saved to Drive. Standalone source was then restored to the read-only probe; deployed endpoint remained health-only throughout. This proves SpreadsheetApp write access, not extension background transport. See integrations/reccie-apps-script/README.md for exact result and remaining checks.

