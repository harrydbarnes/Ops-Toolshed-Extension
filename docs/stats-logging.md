# Stats collection and reporting

## Save counts

Earlier Stats releases incremented `dailyStats[date].placements` whenever the
placement Save buttons were clicked. This did not prove creation, persistence or
even a successful save. These values, and undated `legacyStats.placementsAdded`,
are retained as **historical save clicks** under About these counts. They are
excluded from confirmed-save cards and charts.

The collector now observes native success notices only during a pending Save or
Save & Add Another action. It requires an explicit placement acknowledgement such
as “Placement created successfully”, “Placement updated successfully”, or a
placement-saved message marked as success. Generic success messages, disappearance
of a spinner, a closed form, and old notices are insufficient.

Explicit created/added or updated wording establishes the classification. For a
generic placement-saved acknowledgement, an explicit New/Add/Create placement or
Edit placement form heading supplies it; otherwise it is an **other confirmed
save**. Unrecognised wording is ignored rather than guessed.

A pending operation lasts at most 20 seconds. Duplicate clicks while pending do
not create further operations. An error, route change, pagehide or disabled Stats
cancels it. The observer runs only during that pending operation. The background
serialises writes and stores the counter and operation receipt together. The most
recent 5,000 receipt IDs survive service-worker restarts to deduplicate repeated
delivery. No form values or message bodies are persisted. Reset Stats clears the
daily counters, financial snapshots and receipts together.

Reconciliation totals still count clicks, not confirmed financial outcomes, and
are labelled accordingly. Campaign visits are deduplicated per campaign per day.
The collector records visits at startup and on SPA URL changes; metadata capture
continues to share the loading monitor.

## Date ranges and monthly trends

The selector uses local calendar days, Monday-based weeks, and inclusive bounds.
This week/month ends today. Last week/month covers the full previous calendar
period. Future-dated records are excluded. Undated legacy waiting, campaign and
reconciliation totals appear only in All time; they cannot be allocated to a
specific period or chart.

Monthly trends use only dated records inside the selected period. All time shows
the latest 12 months, including zero-activity months. Confirmed saves combine
created, updated and unclassified counts. Campaigns are unique within each month,
not the sum of daily unique counts. Reconciliation clicks and waiting time have
separate chart options. Current/filtered months are labelled as potentially
partial. Month comparisons use the same elapsed number of days in both months,
clamped to the shorter month, including leap February.

The current confirmed-save streak, rolling seven-day comparison, AppLearn blocked
count and latest financial snapshots are explicitly independent of the selector.
Waiting-time kettles follow the selected period. Financial snapshots have no
historical ledger and are not represented as period booking transactions.

## Verification boundary

Jest/jsdom exercises success, error, retry, duplicate, unknown-mode, expiry,
navigation, disable, receipt persistence and calendar boundary behavior with
synthetic native notices. During implementation the signed-in Prisma campaign
tab rendered only a blank application shell. Native notice wording and form
headings could not be established live. Therefore live create/edit and Save & Add
Another capture remain unverified, and unsupported host wording may lead to
undercounting. No real placement was created, edited or saved for this audit.

After reloading the extension, check normal user-authorised creation and editing:
one successful save should increment one appropriate count; failed validation
and repeated acknowledgement rendering should not. Verify Save & Add Another,
disabled Stats, a route transition during a pending save, and the ordinary host
console. If native wording differs, narrow the adapter from observed evidence
and retain the failure/duplicate regression tests.
