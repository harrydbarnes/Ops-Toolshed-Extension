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

After reviewing the upgrade, run `setupSortSafeTracker` to pause saves and verify
the row identifiers, publish Code.gs as a new version of the existing deployment,
then run `enableSortSafeTracker` to reverify and enable saves. Keep
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
The sort-safe writer binds previews to row developer metadata for each unique
D number/campaign/report-month identity. RAW sparse Sheets API writes target that
metadata ID, with null placeholders preserving all other cells and formulas.
Each row uses the short metadata key `or` without a value; the private audit
workbook's Records tab binds its generated metadata ID and sheet ID to the exact
record identity. This avoids putting long identifiers into Sheets' 30,000-character
per-sheet metadata allocation (the two-character key allows up to 15,000 tagged
rows per sheet when no other metadata consumes that allocation).
There is no coordinate-write fallback. Sorting the complete table from a column
dropdown, inserting rows, and moving complete rows are supported. Partial-column
sorts, editing identity fields, replacing imports, and moving columns during saves
are not atomic: refresh/reinitialise identifiers after structural changes and
reconcile uncertain results before retrying. ScriptLock serialises this service
only; it does not provide compare-and-set against direct human field edits.

Enable the advanced Google Sheets v4 service in the writer project. Run
`setupSortSafeTracker` during a coordinated pause in structural edits. It disables
new saves, adds invisible identity metadata to unique valid records in Main/Early,
verifies it, and installs comment-dependent yellow conditional formatting on reports
with a Comments column. Status-only reports do not require that column. Duplicate
identities remain unwritable. Run `enableSortSafeTracker` to repeat verification
and activate saves. Old cached previews are rejected and must be opened again.
New/imported records without identifiers fail closed until setup is rerun; do not
create tags from request-time row positions. Missing or mismatched tags never
fall back to writing a row number. Existing base colours are preserved; automatic
yellow follows non-empty comments and disappears on clearing a comment.

The separate private audit workbook stores actor email, D/campaign/month, original
and confirmed values, request IDs and outcomes. It is not shared with colleagues.
Automatic writes and three-minute post-financial-request checks are opt-in per Chrome profile and default off. The same fixed-sheet writer handles both, with client-verified automatic saves distinguished in the audit intent. Google does not query Prisma itself.

## Pilot verification

Reload the unpacked extension and reopen Reccies. Read the live tracker, choose a
known D number, inspect its preview and cancel first (no tracker change). Then use
an explicitly chosen test placement, confirm the save, verify the actual sheet and
audit receipt, and restore its original value when testing. Repeat the preview for
a filtered campaign to confirm only matching D numbers are listed. Test a second
allowlisted colleague before enabling any automatic-update work.

## Sort safeguard release: 3 November 2026

Version 5 was published through the existing signed-in Chrome session at the same
deployment URL, retaining owner execution, GroupM domain access and the private
allowlist. The Sheets v4 service was enabled without changing OAuth scopes.
Setup created and verified 1,889 Main identifiers and 271 Early identifiers, with
no ambiguous records. Activation reverified all 2,160 identifiers, created none,
then enabled saves. Main has Comments-based conditional highlighting; Early has
no Comments column. The live endpoint returned the expected identity, service,
protocol 1 and `manualEnabled:true` after activation. No live status or comment
values were changed during this rollout.

On the user's copy, both combined status/note saves and the separate Yes-save path
were previewed, the full report was sorted before commit, and the intended records
were confirmed. Restoration after another sort was confirmed for both tests;
row formulas were preserved in both. Local regression coverage also moves rows
at the API write boundary and verifies missing or mismatched identifiers cannot
fall back to row coordinates. Installed-extension interaction against the updated
live writer has not been repeated in this rollout.

New records require owner setup before extension saves. Replacing record identities
inside existing tagged rows fails closed and requires owner reconciliation of the
identifier registry during a pause in structural edits; setup deliberately does
not silently rebind an existing identifier to different data.

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

## Automatic client release: 22 October 2026

Version 3 deployed successfully at 21:07 London time. The only server change adds
an audit cause bound to the preview token, distinguishing Client verified Prisma
statuses from Manual confirmation. The allowlist, Google scopes, fixed tracker,
identity checks, write guards and endpoint URL are unchanged. This release did not
submit a financial update or change tracker values. Automatic opt-ins remain off
until the user enables them in their Chrome profile. The actual Send to finance
menu actions were inspected live; the Confirm-triggered three-minute path still needs a real user
reconciliation update to prove its complete installed-extension lifecycle.

The trigger was refined after inspecting the actual finance preview: it starts on
Confirm, not menu selection, and requires an observed reconciliation transition
and a sendable preview Line ID + month. The inspected April preview had two
unchanged lines and zero ready to send, so Confirm was never clicked. Cancel closed
it without submitting financial changes. This trigger refinement is client-only;
version 3 audit attribution remains unchanged.

## Notes/status upgrade

`previewEdit` accepts per-row expected/current status and comment plus target Yes/No and comment (2,000 characters maximum). The existing commit operation consumes an actor-bound preview. The service rematches identities/month, checks both original fields and formulas/validation, journals intentions, writes status/comments and pale yellow row backgrounds for non-empty notes, then reads back fields and colours. Clearing a comment does not reset backgrounds. Pending receipt recovery reads all fields/colours without replaying edits. No new scopes or allowlist entries are needed. Deploy the updated Code.gs at the existing URL before testing notes.

## Live release record: 2 November 2026

Version 4 deployed to the existing service URL after Harry approved notes/status deployment. Execution remains as Harry; domain access remains Anyone within groupm.com, with the same private server allowlist. No new scopes or permissions were requested. Editor source was read back and matched the tested local Code.gs exactly (LF-normalized length 20,094; FNV-1a b7f97a63). Google confirmed deployment success; a live GET returned ok=true, Harry's identity, manualEnabled=true, service/protocol unchanged. No tracker write or note/highlight test was submitted during deployment. Installed-extension preview and real save/readback remain to be tested.
