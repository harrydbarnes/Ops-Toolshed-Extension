# Local font measurement — 22 October 2026

## Result

Outfit and Montserrat are now bundled for the 11 extension HTML pages which
previously linked to Google Fonts. All seven existing language subsets are
preserved. Google Fonts stylesheet access was removed from extension-page CSP.
Prisma content-script typography and the separate Font Awesome CDN are unchanged.

This removes Google font network dependencies. It does **not** establish a
consistent improvement in installed-extension page-opening time.

## Exact size

| Component | Added bytes | KiB |
| --- | ---: | ---: |
| Seven WOFF2 files | 218,868 | 213.74 |
| Complete fonts directory, including CSS, licences and source README | 231,737 | 226.31 |
| Net runtime source increase, including HTML/CSP edits and release note | 232,787 | 227.33 |
| ZIP size increase for the changed runtime files and added font directory | 225,095 | 219.82 |

The ZIP comparison used PowerShell `Compress-Archive -CompressionLevel Optimal`:
39,029 bytes before and 264,124 bytes after. These are comparison archives of the
12 changed HTML/manifest files, with the fonts directory added afterwards, **not
complete user-installable extension packages**. Unchanged files, development
reports/tests and later build timestamp changes are excluded. Actual release ZIP
compression can produce a slightly different delta.

The earlier 50–150 KB estimate was too low for preserving every language subset.
The Latin subsets actually downloaded for these English pages total 70,248 bytes
for both families. Extra language subsets account for the remainder and are only
loaded when text requires them; they still occupy package space.

## Method and evidence boundary

- Chrome 156 on the user's Windows machine; no network throttling.
- Same local HTTP server and minimal in-memory Chrome API stubs for both variants.
  Baseline root HTML/CSS came from the clean checkout's HEAD; the after variant
  used the edited source. Scripts, layout and page content were otherwise retained.
  Baseline commit: `5a33ea7ea9960aa0071b6d462c3ab433b3df608a`.
- Three alternating uncached/cached repetitions for each of Settings, Approvers
  and Toolshed, before and after: 36 recorded page loads.
- Uncached means `Network.setCacheDisabled(true)` on the measurement tab. It
  bypasses HTTP cache; it does **not** reset DNS, TLS, QUIC connections or OS caches.
- Cached means normal browser caching, immediately after the corresponding
  uncached navigation. No global browser cache or user data was cleared.
- Chrome DevTools Protocol request/response/loading-finished events provide the
  durations, transfer lengths and response cache headers. Measurements wait for
  actual font request completion; overlapping transfers are not summed as elapsed
  page time.
- These are real browser **localhost preview measurements**, not measurements of
  `chrome-extension://` resource loading. Local HTTP still has server and browser
  scheduling costs that a packaged extension does not have. There is no verified
  installed-extension reload or installed-extension before/after trace.
- An initial preview run lacked the Chrome stubs and could show the disabled-page
  gate. Those exploratory runs were excluded from the main 36 samples. Two
  exploratory/preflight outliers remain separately labelled in the JSON.

Full request-level evidence: [font-measurement-2026-10-22.json](font-measurement-2026-10-22.json).

## Repeated measurements

Medians in milliseconds, three runs per cell. CSS is the slowest font stylesheet
request in that page load; font is the slowest requested WOFF2 subset. The window
is elapsed time from the first font stylesheet request to the last font transfer
finishing. It includes discovery/render scheduling gaps and is **not** a measure
of time spent blocking the UI or total page-opening time.

| Page | Cache | CSS before → after | WOFF2 before → after | Retrieval window before → after |
| --- | --- | ---: | ---: | ---: |
| Settings | Bypassed | 115.3 → 108.6 | 26.7 → 32.0 | 385.2 → 204.0 |
| Approvers | Bypassed | 99.9 → 84.0 | 39.6 → 36.0 | 384.6 → 364.3 |
| Toolshed | Bypassed | 83.5 → 110.8 | 17.8 → 16.3 | 142.5 → 152.5 |
| Settings | Normal/cached | 0.3 → 0.1 | 0.1 → 0.0 | 46.1 → 67.7 |
| Approvers | Normal/cached | 0.1 → 0.0 | 0.1 → 0.0 | 42.0 → 39.8 |
| Toolshed | Normal/cached | 0.1 → 0.0 | 0.1 → 0.1 | 46.0 → 36.2 |

All cached samples transferred **zero font/CSS network bytes**, both before and
after. Sub-millisecond values and three samples are insufficient to claim a
meaningful cached speed improvement. Toolshed's uncached retrieval window was
slightly slower locally, so there is no uniform speed gain even in this preview.

The initial exploratory Settings trace showed a 3,757.1 ms Outfit transfer; a
later Approvers preflight showed 9,687.4 ms and 9,686.0 ms remote font transfers.
These demonstrate variability in this session, not typical timings or guaranteed
time savings. The initial 1.27 s Google CSS timing was observed separately before
the repeated run and is not included in its medians.

## Requests and how often they occur

| Page | Before: Google CSS + WOFF2 | After: local CSS + WOFF2 |
| --- | --- | --- |
| Settings, initial visible state | 2 + 1 | 1 + 1 |
| Approvers, rendered directory | 2 + 2 | 1 + 2 |
| Toolshed, Release Notes | 1 + 1 | 1 + 1 |

Before: all 11 linked HTML documents can request Google CSS when opened/reloaded.
Font binaries are fetched when their family/subset is actually needed. Settings
did not need Montserrat in the initial visible state, although it requested its
stylesheet. Requests are page/usage driven, not periodic polling.

Observed Google cache headers: CSS `private, max-age=86400,
stale-while-revalidate=604800`; WOFF2 `public, max-age=31536000`. Thus CSS may be
reused for a day and unchanged font binaries for a year, subject to browser cache
partitioning, eviction, cache clearing, reload mode and URL/version changes.
Expiry does not imply a fresh full download on every visit: revalidation and
background refresh are possible. The observed warm loads reused cached data.

After: the same page openings resolve local packaged files, with **zero Google
font requests/downloads**. The preview's own local HTTP cache uses a one-hour
maximum age; this is a harness setting, not an extension caching guarantee.
Packaged fonts are delivered once with installation/update and read locally as
needed. Font decoding and layout still take time.

## Checks

Approvers rendered its 127-person directory in the local preview. With both
Google font domains blocked and cache bypassed, local font loading still worked;
explicit Latin-extended, Vietnamese and Cyrillic character samples loaded all
five Montserrat subsets and both Outfit subsets. Network/cache overrides were
restored afterwards. Font Awesome is a separate unchanged external dependency.

A packaging regression test checks all 11 HTML links, every CSS font source,
WOFF2 signatures/declared lengths, bundled licences and the CSP removal.

Validation completed:

- Focused checks: local-font packaging, settings toggle contracts, Toolshed Stats
  and Approvers XSS coverage passed (19 tests across four suites, after correcting
  the new packaging test for jsdom's unsupported font-face descriptors).
- Full `npm test`: 103 suites, 1,175 tests, one snapshot; 100 suites and 1,171
  tests passed. Three suites had four obsolete expectations: the Google font
  links, a Google query-string family check, and the exact release-note count.
  That run completed normally in 637.74 seconds without forced exit.
- Updated those expectations while preserving existing checks. Focused reruns of
  all three affected suites passed: 19 tests. Thus all 103 suites have passing
  results across the full run and targeted reruns; no second full run was made
  after the expectation updates.
- Final syntax check: 219 JavaScript files passed; Git whitespace check passed.
- Build metadata refreshed and staged. No commit or push was made.
