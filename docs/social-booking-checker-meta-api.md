# Social Booking Checker Meta API refresh

The Social Booking Checker uses an uploaded Meta Ads Report to establish which
ad accounts it may query. It does not discover accounts through a Meta Business
ID and does not call Business Management account-list endpoints.

## Import-first workflow

1. Upload the campaign-level `Meta Spend Across Agency` CSV.
2. The checker extracts and deduplicates Account IDs, Account names, Campaign
   IDs, Campaign names, Ad Set IDs, and Ad Set names when those columns exist.
3. That hierarchy is stored in `chrome.storage.local` as
   `socialBookingMetaReference`.
4. Select the imported accounts that match the Prisma report.
5. Optionally save an `ads_read` token and sync those accounts for a selected
   reporting range.

The imported CSV remains immediately usable for comparison. A user only needs
to import another report when a new Meta ad account is introduced or they want
to rebuild the locally remembered hierarchy. **Forget imported accounts**
removes that reference explicitly.

CSV is retained as the supported import format because it is already the
required format for both sides of this browser-based comparison. The attached
architecture's XLSX option would require shipping a spreadsheet parser in the
extension and is not part of this implementation.

## Local token handling

Users enter their own Meta access token. It is stored under
`socialBookingMetaApiCredentials` in `chrome.storage.local`.

- No token or Business ID is present in repository source or defaults.
- Business ID is no longer requested. Previously stored Business IDs are
  removed automatically when the credential record is next read.
- The credential is not stored in `chrome.storage.sync`.
- The saved token is never put back into an input or displayed.
- The user can remove the token at any time.
- The token is sent to `graph.facebook.com` in an `Authorization: Bearer`
  header, never in a query string.

`chrome.storage.local` is local extension storage, not an encrypted secrets
vault. Users should use a least-privilege, revocable token and remove it when it
is no longer required.

## Read-only API calls

The current implementation uses Graph API `v24.0`. For Account IDs taken from
the import, it sends only GET requests to:

- `/act_{account-id}/campaigns` for campaign names, dates, statuses, and
  campaign-level budgets.
- `/act_{account-id}/adsets` for ad set IDs and names linked to campaigns.
- `/act_{account-id}/insights?level=campaign` for spend over an explicit
  `time_range`.

There are no POST, PUT, PATCH, or DELETE requests. The integration does not use
`owned_ad_accounts`, `client_ad_accounts`, `ads_management`, or
`business_management`. The supplied token and its assigned ad-account assets
must permit `ads_read` access.

Every paginated response is followed. HTTP 429, HTTP 5xx, and Meta throttling
codes 4, 17, 32, and 613 are retried with bounded exponential backoff. Errors
are shown without including the token.

## Date ranges and comparison normalisation

The UI provides Today, Yesterday, Last 7 days, Last 14 days, Last 30 days, This
month, Last month, and a custom range. Custom dates map directly to Meta's
`time_range`; longer ranges are split into calendar months because the Prisma
comparison is keyed by Account ID, Campaign ID, and month.

API results are converted in memory to the same Meta column shape already used
by `social-finance-engine.js`. Existing account scope, dates, spend tolerance,
month filtering, and missing-booking checks therefore share one comparison
path.

If Meta returns an unknown campaign or ad set for an imported Account ID, it is
added to the local reference. Each refreshed account receives a `lastSynced`
timestamp.

Lifetime budget takes precedence when present; otherwise daily budget is used.
Meta's minor budget units are divided by 100. Budget remains context only—the
comparison continues to compare monthly Meta spend with Prisma planned amount.

The API result is discarded when the page closes or **Clear pulled data** is
clicked. The imported hierarchy and token persist locally until explicitly
removed.

## Extension boundary

The source prompt describes a server-side service. Ops Toolshed is a standalone
Chrome extension and has no credential-handling server, so its reusable client
runs inside the extension page. This preserves the previously requested local
token model but cannot make the token inaccessible to someone who can inspect
that Chrome profile or the running extension.
