# Reccies

Open **Reccies** in the Prisma header.
The same page works in Chrome's sidebar and in a full tab. The global panel is
available when opening a placement in another tab; Help Guides shares the panel.

The header launcher prepares Reccies when it appears and on pointer
entry or keyboard focus. While initial preparation is pending, the sidebar
button shows a starting/preparing state. Preparation enables the existing panel
without opening it or replacing an open Help Guides page. The extension popup does not include Reccies controls.

If Chrome has put the background worker to sleep again and an opening click
arrives before it is ready, the launcher prepares it and returns to ready. Click
again to open the sidebar: Chrome requires a fresh user gesture, so the extension
does not replay the original click automatically. Other opening errors retain
their actual error text in the header button accessibility label.
Preparation respects Features off and does not use keepalive polling.

## Tracker reads

Paste the URL of the Google Sheet's **Reccie report** tab, choose its report month,
then choose **Read Google Sheet**. Chrome requests optional access to
`https://docs.google.com/*` only after this click. The extension sends an authenticated
GET to that tab's `gviz/tq?tqx=out:csv` endpoint. A Google sign-in page, redirect,
missing permission, malformed report, or fetch failure preserves the last successful
snapshot and shows an error. This session-backed read is not a Google OAuth integration;
account and organisational policies can prevent it. Use a CSV export of the same tab
as the fallback. CSV data is explicitly shown as a snapshot.

Every row uses the selected report month, including rows without Booking End Date.
Required columns: Serial Number, Campaign ID Mediaocean, Buyer Name, Ops Assigned,
Group and Reccied. Optional display columns include client, campaign description,
supplier, order, gross and comments. Column letters may change; headers drive matching.
Imported report contents, assignment preferences, and results remain in
`chrome.storage.local`. Forget local tracker data removes them.

Show by controls grouping independently: D number (the default) or Campaign.
Tracker Reccie status is Any, No or Yes. It reads only the imported Reccied
field. Prisma status has optional checkboxes for
Yes in sheet, not in Prisma; Ready in Prisma; and Needs attention. Selected Prisma
statuses combine with OR, then combine with Tracker Reccie status using AND. For example,
No plus Ready in Prisma shows only rows ready to mark Yes in the tracker.
No Prisma checkboxes selected means any Prisma status, including not checked.

Clear filters resets Tracker Reccie status to Any, clears Prisma statuses and search,
and preserves grouping, person and assignment. Fresh users start with Any and no
Prisma filters. Legacy saved dropdown choices migrate automatically. Old mixed OR
selections become separate tracker/Prisma conditions with a one-time explanation;
old opposite tracker selections become Any with no Prisma restriction, retaining
that selection's previous all-rows meaning.

Ready and Needs attention retain existing check-result logic. A sheet-Yes mismatch
requires a completed outstanding result, not simply absence of ready status:
failed, unchecked and review results remain separate. The badge reads Prisma
mismatch so a failing buy status is not mistaken for Reconciled = No.

Tracker, Prisma and search filters apply before grouping. Campaign counts and
muted D number lists include only matching rows. Blank campaign IDs share a No
campaign entry per month. Campaign cards show mismatch details and attention
reasons per D number, including access errors and missing data. Search highlighting
uses the shared Campaign History helper. Verification checks every matching source
row, including rows below Show more. The finish message distinguishes rows checked
from rows still matching afterward. Prisma business rules and requests are unchanged.

## Prisma checks

The user chooses a name and assignment role, filters the list, then chooses
**Verify Reccie Status**. Checks are on demand, not scheduled. Requests are grouped by
campaign and month and limited to 50 campaigns and 500 rows per message. Eight
workers (by default) pull continuously from the queue, without ten-campaign barriers. LP's
372-row, 46-campaign baseline therefore fits one queue. The background worker resolves the public CP
number, then sends the captured complete Actualise query with 110 fields. This
endpoint uses PUT for a query; it does not change bookings.

Each request has a 30-second timeout. A timeout, network failure or HTTP
500/502/503/504 receives at most one retry, behind campaigns not yet started and
at least one second after the failure. When a grid request fails, the retry reuses
that run's successfully validated campaign lookup. There is no reuse of previous
grid results. Access errors, rate limits, invalid campaign identities and malformed
grids are not retried. Final failures remain visibly marked Check failed.

Each queue has a four-minute time budget, including retries. Requests use the
smaller of 30 seconds and the remaining budget. Once the budget expires, queued
rows receive a time-limit message and can be checked again. This bounds the longer
queue; increasing concurrency or extending every request timeout is not necessary.

Exactly one row must match `buySerialNumber` and `month`. Ready requires
`okToPay === '1'` and `buyStatus === 'SUCCESSFUL'`. Actualised is not a condition.
Duplicate tracker D numbers, missing matches, multiple matches, and incomplete
statuses require review. Failed access replaces the previous result with an error.
Results show their check time independently from the tracker read time. A tracker
refresh clears previous checks. Results from an older report revision are discarded.

## Manual tracker updates

For live Google Sheet reports from the Ops Reccie Tracker, individual cards offer
**Mark Yes in tracker**. Campaign actions include only the D numbers matching your
current filters, with a maximum of 100 per save. CSV imports and Automatic discovery
remain read-only.

The preview reads the live tracker, lists eligible and skipped placements, and
requires confirmation that you have reconciled them. It changes only Reccied to
Yes; it does not alter Prisma or require a successful Prisma check for this manual
attestation. The server rematches D number, campaign ID and report month, skips
ambiguous or changed rows, and confirms saved values before updating local cards.

Google identifies the signed-in user. Access is controlled remotely by a private
server allowlist, never a list bundled in the extension. Saves record the actor,
selection and outcomes in a separate private audit workbook. If a save times out or loses its connection, the dialog checks the receipt once
without repeating the write. **Check last tracker save** also recovers the receipt
after reopening the page.
Automatic updates default off per Chrome profile. Deployment must enable writes before
these actions can save; preview errors leave the tracker unchanged.

## Existing Apps Script

The inspected tracker project currently has `edit(e)` and `open(e)` functions calling
the Toolbox library for telemetry. No `doGet` reader was present in the inspected
Code.gs. It was neither edited nor run. A future authenticated read-only Apps Script
web app could return a stable report schema and explicit month. That would require
an intentional deployment and access policy; do not expose this tracker anonymously.
It is not necessary for CSV import or the session-backed Google read.

## Validation boundaries

### Measuring a verification run

Reload the extension, reopen My Reccies, select LP and the relevant assignment,
choose All my D numbers, clear Search and press Verify Reccie Status. Expand
Verification timings after completion and choose Download timings (.md), or copy
its selectable JSON for analysis. The download contains the full report, including
every batch and failed request, and also works for a saved run after reopening.
Full run diagnostics remain available after automatic saves change the local tracker revision.
This uses the locally loaded report; read the Google Sheet again first if needed.

The report covers all batches, including rows below Show more. It records elapsed
wall time, actual fetch attempts, skipped tracker issues, per-campaign queue time,
lookup/grid timings and failed campaigns. `headersMs` measures fetch until response
headers; `totalMs` for a request includes downloading and parsing JSON. These are
client-observed durations, not pure server timings. Campaign durations sum active
attempt time, including validation and result processing, but exclude time waiting
for a deferred retry. Each request records its attempt number, start offset within
the batch, timeout, and error name if it fails. Campaign retryQueueMs records when
its second attempt starts. Batch durations end before their final storage
write; run duration includes message round trips and rendering. Concurrent request
durations overlap and must not be added to estimate elapsed time.

The default limits are eight campaign workers, fifty campaign/month groups and
500 rows per batch. Retry totals count campaign second attempts; actual request
counts include every fetch attempt. cacheHits remains zero because previous grid
results are never reused.
HTTP success can still produce a failed campaign if the grid is invalid. A completed
run can contain failed campaign checks; inspect failedCampaigns and each row.
Diagnostics stay in local extension storage and contain campaign IDs and counts,
the selected name, assignment, filters, tracker revision and selected sheet row
numbers. They contain no credentials or raw Prisma responses. Only the latest run is
retained, associated with its tracker revision; Forget local tracker data removes it.
Compare a new download with the October 21 baseline: 372 rows, 46 campaigns,
91 requests, 111.554 seconds and four failed campaigns (42 rows). That older run
had five ten-campaign batches and no retries. Compare remaining failures as well
as elapsed time; a retry that recovers rows adds work and may increase duration.

### Debug runs

The normal Verify Reccie Status button uses eight workers. At the very bottom of
My Reccies, expand Debug to choose a worker count from 1 to 20 with the slider,
then choose Run. This overrides the concurrency for that debug run only; the next
normal verification still uses eight. Query, retry and time limits are identical.
The background accepts only whole-number methods within the supported range.

Verification timings and Download timings (.md) remain inside Debug. Every run,
including normal verification, creates the same method-labelled report. Keep the
same tracker and filters and download each result before another run, because
only the latest report is retained. Worker selection and Run are disabled while
checking. Run is also disabled when no matching rows are available or the report
month needs refreshing. The slider defaults to eight when reopening the page.

The original full query was successfully run in the installed extension service-worker
Console for September 2026. A campaign that was not open returned nine rows and the
expected reconciled/successful D number. The Google CSV endpoint returned the report
from its signed-in Sheets tab. These do not by themselves prove the newly implemented
Google background fetch or the sidebar's installed Chrome behaviour.

After reloading the unpacked extension and Prisma, verify: header placement and hit
target, header sidebar opening, opening a campaign in another tab, switching
between Reccies and Help Guides, actual Google reading after optional permission,
CSV fallback, assignment and month persistence, a known complete row and a known
incomplete row, sign-in failure, feature-off cleanup, Plan/Actualise/Close transitions,
and absence of Google write traffic with automatic marking disabled. Do not change the real Sheet while testing.

While verification is active, the status message shows a pulsing dot and a fixed-width
. / .. / ... animation. Both stop on completion or error, with a static indicator
when reduced motion is requested. Decorative animation is hidden from screen readers.


## Sources and modes

The top source selector separates **Main Tracker**, **Early Recs**, and **Automatic**.
Main Tracker retains the existing monthly import and assignment workflow.
Early Recs reads the **Early Reccie report** tab in the same spreadsheet by name.
Campaign ID (G) and Booking End Date (I) are read by header, not fixed position.
Only current-month dated placements qualify. Blank dates inherit the month only
when all valid dates establish the current month and none are invalid. Ambiguous
dates remain visible for attention and are not queried. Other dated months are
excluded. If no dates establish the current month, discovery becomes an explicitly
labelled visited-campaign fallback. If the sheet cannot be read or has missing
headers, the error is shown; users can explicitly choose that fallback instead.

Automatic uses existing Campaign History entries whose latest visit was this month
in Europe/London, deduplicated by campaign ID. Discovery is explicit, not scheduled.
It queries current-month placements in the 50 most recently visited eligible
campaigns with the same eight-worker queue and business rule. Coverage shows the
eligible, attempted and successful campaign counts, any limit and campaign errors.
History logging must have been enabled for visits to be recorded. This is not a
complete booking ledger and does not establish that the user booked each placement.
Assignment and tracker-only filters are therefore hidden for discovered placements.
Failed discovery retains previously known placements in that campaign as failed
checks, and reports campaign-level failures even if no D numbers were known.

Main, Early and Automatic snapshots are stored separately; Early and Automatic
are also scoped by current month. Each mode has separate filters and diagnostics.
Main remains the default on reopening, and its header count stays tied to
Main Tracker assignments. Clear saved report data in Debug removes only the selected local report and its
preferences/timing. Main and Early can write through the authenticated Apps Script service when explicitly confirmed or opted in, as described below. Automatic discovery remains read-only.

Sheet setup is under **Reccie tracking settings**. The **Clear saved report data**
reset is inside the collapsed **Debug** section in every mode. Routine verification
refreshes Prisma results without requiring a reset.

Show by and Tracker Reccie status use adjacent pill selectors, sharing the Features
settings appearance with Reccie source. Arrow keys change the active choice;
selection, saved filters and verification rules are unchanged.

## Activity feedback

Verification, report reads, live write previews, saves and receipt checks share
one animated status renderer and the reduced-motion styling. Reading a report
scrolls its status into view. A connection-only response to preview is retried
once as a read-only preview; other incomplete responses remain errors. No write
is sent until an actual valid preview and explicit confirmation are present.

## Opt-in automatic updates and financial checks

Reccie tracking settings has two independent switches, both off by default:
Automatically mark Yes after Prisma verification, and Verify three minutes after a
financial update. Enabling writes requests Google script access from that click.
Automatic marking applies only to the selected person's assigned rows in connected
Main/Early Google reports, never CSV or visited-campaign discovery. Only rows in
the current fresh check qualify: unique D/campaign/month, Reconciled = Yes and
Successful buy status, no data issue, not already Yes. Checks older than five
minutes do not qualify. Server preview, rematching and saved-value readback remain
in place. Disabling opt-in before commit prevents a new save. Audit entries identify
client-verified automatic saves separately from manual attestation.

The delayed trigger observes reconciliation changes while this tab is open, then
waits for the native financial preview Confirm action. It intersects observed
Yes-to-No / No-to-Yes changes with sendable preview Line IDs and Buy date months.
Opening Send to finance, cancelling the preview, unchanged/not-ready buys and
updates only to gross/date fields do not schedule checks. Line IDs are mapped to
D numbers through a fresh Prisma query, not through grid position. Only those
placement/month pairs can qualify for automatic marking. Yes-to-No results show
outstanding/mismatch status; the tracker is never automatically changed to No.
Changes made before the extension observed that tab, on another computer or in
unrendered rows are not inferred. Use Verify Reccie Status for those placements.
A fresh background Prisma query is always required before any write, even if the
confirmed financial push fails or is still processing.

Jobs are persisted in local storage and use Chrome alarms, so closing the sidebar
or navigating away does not cancel them. Repeated campaign/month requests reset the
three-minute due time. Chrome must be running and Prisma signed in; sleeping Chrome
can run the alarm later. Feature-off, a non-Prisma profile and setting-off prevent
new background actions. A busy verification defers the job. Failures are recorded
under tracking settings. The extension never submits a financial update itself.
Unknown save outcomes retain an individual receipt job; recovery reads receipts
without repeating commits. Up to three automatic receipt checks are made, then the
saved request remains available for manual recovery.

### Reccies appearance

Settings → Features → Appearance → Reccies appearance offers V1 and V2, with V2 selected by default. Choose V1 for the original layout. Both appearances use the same reports, assignments, filters, verification and write handlers. The quick × beside Prisma chips clears only Prisma selections and is hidden when it would require another row; Clear filters remains available. Existing automatic-write preferences are unchanged and remain opt-in.

V2 result transitions respect reduced motion. Collapse settings hides source, connection and filter controls for the current sidebar instance only; selected filters remain active and Verify stays available. Show settings restores the controls. A newly opened sidebar starts expanded. Campaign headers retain month-specific Prisma URLs while omitting the month beside the CP reference.
