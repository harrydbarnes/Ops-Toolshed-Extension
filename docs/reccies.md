# Reccies read-only preview

Open **Reccies** in the Prisma header, or **My Reccies** in the extension popup.
The same page works in Chrome's sidebar and in a full tab. The global panel is
available when opening a placement in another tab; Help Guides shares the panel.

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

The Show menu lists All my D numbers, All my campaigns, Unreconciled, Reconciled,
Verified reconciled in Prisma and Needs review. Reconciled and Unreconciled use
the imported tracker Reccied field; Prisma verification remains independent.
Campaigns group the selected person's rows by CP number and month, display unique
D numbers and their count, and retain all assigned D numbers when a campaign
matches a search. Verification in that view checks those underlying rows. Search
highlighting and its stylesheet are shared with Campaign History.

## Prisma checks

The user chooses a name and assignment role, filters the list, then chooses
**Verify Reccie Status**. Checks are on demand, not scheduled. Requests are grouped by
campaign and month and limited to 10 campaigns and 500 rows per message. Three
campaigns may be read concurrently. The background worker resolves the public CP
number, then sends the captured complete Actualise query with 110 fields. This
endpoint uses PUT for a query; it does not change bookings.

Exactly one row must match `buySerialNumber` and `month`. Ready requires
`okToPay === '1'` and `buyStatus === 'SUCCESSFUL'`. Actualised is not a condition.
Duplicate tracker D numbers, missing matches, multiple matches, and incomplete
statuses require review. Failed access replaces the previous result with an error.
Results show their check time independently from the tracker read time. A tracker
refresh clears previous checks. Results from an older report revision are discarded.

There is no Google Sheets write endpoint, write action, mark-as-reccied button,
Apps Script execution, or automatic tracker update in this preview. Existing Yes
values remain unchanged, even if Prisma disagrees.

## Existing Apps Script

The inspected tracker project currently has `edit(e)` and `open(e)` functions calling
the Toolbox library for telemetry. No `doGet` reader was present in the inspected
Code.gs. It was neither edited nor run. A future authenticated read-only Apps Script
web app could return a stable report schema and explicit month. That would require
an intentional deployment and access policy; do not expose this tracker anonymously.
It is not necessary for CSV import or the session-backed Google read.

## Validation boundaries

The original full query was successfully run in the installed extension service-worker
Console for September 2026. A campaign that was not open returned nine rows and the
expected reconciled/successful D number. The Google CSV endpoint returned the report
from its signed-in Sheets tab. These do not by themselves prove the newly implemented
Google background fetch or the sidebar's installed Chrome behaviour.

After reloading the unpacked extension and Prisma, verify: header placement and hit
target, header and popup sidebar opening, opening a campaign in another tab, switching
between Reccies and Help Guides, actual Google reading after optional permission,
CSV fallback, assignment and month persistence, a known complete row and a known
incomplete row, sign-in failure, feature-off cleanup, Plan/Actualise/Close transitions,
and absence of Google write traffic. Do not change the real Sheet while testing.
