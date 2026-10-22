# Manual Reccie tracker writer

This service upgrades the guarded pilot at its existing deployment URL. It runs as
the deployment owner and reads the signed-in Google identity on every request.
The private ALLOW_<lowercase email> Script Properties remain the access registry;
no allowlist is distributed with the extension.

## Configuration and release

The project requires the existing userinfo.email and spreadsheets scopes. No new
OAuth scope is introduced. Keep the Workspace/domain deployment access setting.
Run the editor-only setupAudit_ helper once to create private Changes and Requests
tabs; it sets AUDIT_SPREADSHEET_ID, disables the old fixed-cell test and starts with
MANUAL_WRITES_ENABLED=false. It has already been run in the pilot project.

After reviewing the upgrade, publish Code.gs as a new version of the existing
deployment and explicitly enable MANUAL_WRITES_ENABLED=true. Keep
WRITE_TEST_ENABLED=false. Setting the manual flag false blocks new previews and
commits while receipt recovery remains available. Removing ALLOW_email or setting
it false revokes that user on their next request, including receipt access.

## Save protocol

Preview takes only main/early mode, report month and at most 100 D/campaign pairs.
The tracker ID and tab names are fixed on the server. Preview tokens expire after
120 seconds and bind the actor, selection and original values. Commit consumes the
token and records a durable request and audit intent before any tracker write.
It rematches D number + campaign ID + month immediately before writing, skips
ambiguous, changed, formula or unexpected cells, and reads the result back.
Only confirmed Yes results update the extension snapshot. Manual confirmation is
an attestation by the user; it does not claim server-side Prisma verification.

Requests are idempotent. If the response is lost, status reads the receipt and can
recover an interrupted request by reading the current tracker without writing.
Google Sheets does not provide an atomic compare-and-set transaction against
concurrent human sorts/edits or other scripts. ScriptLock serialises this service
only. Rematching reduces this risk; avoid sorting during a save.

The separate private audit workbook stores actor email, D/campaign/month, original
and confirmed values, request IDs and outcomes. It is not shared with colleagues.
No automatic updates, timers or financial-update hooks are enabled.

## Pilot verification

Reload the unpacked extension and reopen Reccies. Read the live tracker, choose a
known D number, inspect its preview and cancel first (no tracker change). Then use
an explicitly chosen test placement, confirm the save, verify the actual sheet and
audit receipt, and restore its original value when testing. Repeat the preview for
a filtered campaign to confirm only matching D numbers are listed. Test a second
allowlisted colleague before enabling any automatic-update work.

## Live release record: 22 October 2026

Version 2 was deployed to the existing guarded-pilot URL after Harry explicitly
approved manual updates for the allowlist. MANUAL_WRITES_ENABLED=true;
WRITE_TEST_ENABLED=false. A live GET returned the expected service/protocol,
Harry's Google identity and manualEnabled=true. Deployment itself did not edit tracker values. Installed-extension preview/save testing remains separate
from this identity/status check and the earlier fixed-cell write/restore pilot.

Audit workbook: https://docs.google.com/spreadsheets/d/1Z9LLDBSc747HreEWl_lP0MRBgaAR4zOhNpp0OIrIFyo/edit
The live Sheets UI confirmed it is private to the owner.

Harry subsequently tested the installed UI on D03120200 / CP3G9KS / 2026-09.
The commit response exceeded the 25-second client timeout, but Check save result
returned one saved Yes. The audit confirms one No-to-Yes write and readback.
A later direct read of tracker B208:Q208 confirmed the exact row currently reads
No again; no additional restoration edit was made by the agent. The UI now makes
one automatic receipt-only check after a timeout/connection error, never a repeat
commit. This recovery change needs an extension reload; its live behaviour has
not yet been retested.
