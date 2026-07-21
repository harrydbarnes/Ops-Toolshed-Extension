# Social Booking Checker Meta API source

The Social Booking Checker can use the Meta Graph API instead of a Meta Ads
Reporting CSV. The Prisma booking report remains a CSV upload, and the existing
Meta CSV flow remains available as a fallback.

## Local credentials

Users enter their own Meta access token and Business ID on the Social Booking
Checker page. Both values are stored under `socialBookingMetaApiCredentials` in
`chrome.storage.local`.

- Credentials are not present in repository source, build files, or defaults.
- They are not stored in `chrome.storage.sync`.
- Saved values are never put back into an input or displayed on screen.
- Users can remove the token and Business ID independently.
- Removing either value also clears loaded accounts and any pulled Meta data.
- The token is sent to `graph.facebook.com` in the `Authorization: Bearer`
  header, not in a query string.

`chrome.storage.local` is local extension storage, not an encrypted secrets
vault. Anyone with access to the user's Chrome profile or extension data may be
able to retrieve it. Users should provide a least-privilege, revocable token and
remove it when it is no longer needed.

## API calls

The current implementation uses Graph API `v24.0` and automatically follows
every `paging.next` link:

- `/{business-id}/owned_ad_accounts` and `/{business-id}/client_ad_accounts` for
  the account picker. Results are merged and deduplicated so business-owned and
  shared client accounts are both represented.
- `/{account-id}/campaigns` for campaign names, dates, statuses, and campaign
  budget fields.
- `/{account-id}/adsets` for ad set names linked to campaigns.
- `/{account-id}/insights?level=campaign` for campaign spend over an explicit
  `time_range`.

HTTP 429, HTTP 5xx, and Meta throttling error codes 4, 17, 32, and 613 are
retried with bounded exponential backoff. Other API errors are shown to the user
without including their token.

The token normally needs permission to read ads for the selected accounts and
to read the Business account list. Exact token type, asset assignment, and
permission approval depend on the organisation's Meta Business setup.

## Normalisation into the comparison

The requested reporting range is split into calendar-month ranges because the
Prisma comparison is keyed by Account ID, Campaign ID, and month. Each account's
campaign and ad set metadata is loaded once, while insights are requested once
per month.

The API records are converted in memory to the same Meta column shape accepted
by `social-finance-engine.js`. This keeps all current scope, date, spend,
tolerance, month-filter, and missing-booking logic in one comparison path.

Campaign budgets returned by Meta are minor currency units and are divided by
100. Daily budget takes precedence over lifetime budget when determining the
displayed budget and budget type. Budget remains context only: the comparison
continues to compare monthly Meta spend with Prisma planned amount.

The in-memory normalised Meta data is discarded when the page closes or the
user clicks **Clear pulled data**. Only the credentials and remembered account
scope persist locally.

## Scope limitation

The account list covers the supplied business's owned and client ad-account
edges. It is still limited by the assets and permissions granted to the supplied
token. The CSV fallback should be used when the required account population is
not returned.

This is a browser-extension feature, so it exposes an internal `getReport()`
method rather than an HTTP `GET /api/meta/report` server endpoint. The method
returns the requested campaign-level report without introducing a local or
remote credential-handling server.
