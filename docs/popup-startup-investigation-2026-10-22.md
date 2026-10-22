# Popup startup investigation — 22 October 2026

## Finding

Harry reports that nothing appears for several seconds after clicking the Chrome
extension icon. The reported intermittent slow toolbar opening has **not** been
reproduced or fixed conclusively in this investigation.

The popup is registered directly as `action.default_popup` in `manifest.json`.
There is no extension click handler that first waits for a service-worker message
before opening it. Its initial HTML is visible by default; it does not use the
hidden-page gate used by Settings and other extension pages.

The popup has no remote startup fonts, stylesheet or icon requests. Its linked
resources are local: shared CSS, a 3,197-byte PNG, three small SVGs and JavaScript.
The font migration applies to other extension pages and does not alter popup
fonts. The base popup uses Segoe UI/Arial.

## Startup work inspected

- `popup.js` attaches launcher handlers and reads two small sync settings groups:
  Features switch/legacy backup and Meta tool selection. Those reads are
  asynchronous, and launcher wiring does not await them.
- `reccie-popup.js` queries the active tab to enable the sidebar button and reads
  the current tracker/preferences for its summary. Both are asynchronous. Opening
  the full Reccies page does not depend on either result.
- Fetching the tracker transfers its rows, checks and verification timings into
  the popup, even though its summary only needs a small part of that data. JSON
  deserialisation and row filtering are potential main-thread costs if it grows.
  This investigation did not read or measure Harry's actual stored tracker.
- The service worker performs feature-mode initialisation and alarm setup when
  it starts. No popup startup code waits for that work; this is not evidence that
  service-worker startup causes the visible delay.
- There are no startup sleeps, network fetches, repeated reconciliation timers,
  page-wide blur effects or heavy initial DOM construction in the popup itself.

Chrome documents storage as asynchronous and potentially slow; `storage.sync`
reads use local storage even offline rather than waiting for a cloud sync round
trip: https://developer.chrome.com/docs/extensions/reference/api/storage.

## Changes made

1. Removed the unused `feature-settings-registry.js` script from `popup.html`.
   Its roughly 28 KB feature catalogue was constructed on every popup opening.
   The popup only exposed its key list for CommonJS tests; there was no runtime
   browser consumer. That testing export still reads keys from the central
   registry. Settings and the feature explorer retain the registry unchanged.
2. Scheduled the Reccies summary read through an animation frame followed by a
   timer, giving initial rendering a chance before transferring/scanning tracker
   data. Launcher and sidebar click handlers are still attached immediately.
   This changes when summary work starts, not how much data is read. There is a
   timer fallback for environments without animation frames.

Popup JavaScript before: 28,294 + 21,146 + 2,059 = 51,499 bytes.
After: 20,961 + 2,470 = 23,431 bytes: **28,068 fewer bytes (54.5%)** to load for
the popup. The catalogue remains in the extension for its other pages, so this
is a startup dependency reduction, not a 28 KB distribution-size reduction.

An initial two-animation-frame candidate delayed summary updates by around a
second in this preview, so it was replaced with the single-frame/timer approach.
Its measurements are retained separately, not included in the final medians.

## Browser experiments

Used the current Chrome profile (Chrome 156) and the real popup HTML/CSS/scripts
served on loopback with synthetic Chrome APIs. No real extension storage was
read or written. Three scenarios, three repetitions before and after (18 main
loads), cache bypassed:

| Scenario | Median first content paint before | After |
| --- | ---: | ---: |
| Fast APIs, no stored tracker | 220 ms | 228 ms |
| All four startup API responses delayed 3 seconds | 256 ms | 248 ms |
| Synthetic 20,000-row tracker (3,275,728 JSON characters) | 220 ms | 228 ms |

With three-second API delays, the popup had already painted while API responses
were pending. This demonstrates that those waits alone do not gate the shell in
this preview. It does **not** prove how a real Chrome toolbar popup is scheduled.

After the change, the local tracker read started after the observed first paint
in all nine final runs. Normal summary completion moved from a median 287 ms to
368 ms; the large-tracker summary from 317 ms to 366 ms. That is an intentional
small postponement of the summary, not a demonstrated faster popup appearance.

The results do not establish a meaningful overall first-paint improvement. There
is variation and unrelated work from the normal Chrome profile; observed long
tasks cannot all be attributed to Toolshed. The synthetic large-data fixture is
prepared by the probe before the real popup scripts, and does not reproduce
Chrome's actual storage IPC/deserialisation implementation.

Full measurement evidence: [popup-startup-measurement-2026-10-22.json](popup-startup-measurement-2026-10-22.json).
Harness: `node benchmarks/popup-startup-preview.cjs`, then open
`http://127.0.0.1:8766/popup.html?apiDelay=3000&rows=0`.
The harness writes only synthetic measurement results when its local `/results`
endpoint is called. It is development tooling and should not ship in a release.

## Remaining diagnosis

The leading unresolved area is the interval **before the popup document begins**:
Chrome toolbar handling, renderer scheduling/startup and local resource I/O.
These are candidates, not confirmed causes. Normal-page previews do not exercise
native popup creation or its first-visible-frame policy.

A real slow toolbar opening needs a browser-level trace beginning before the
click, ideally after inactivity and again immediately afterwards. A popup
DevTools Performance recording started after opening cannot recover the earlier
click-to-document interval; keeping DevTools open can also change cold-start
behaviour. Compare the same idle/reopen sequence with another installed popup
extension to distinguish a profile-wide symptom from Toolshed-only behaviour.

There is a superficially similar Chromium report for **macOS**, with a minimal
popup and no service worker/network reproducing cold-open delays:
https://issues.chromium.org/issues/549552319. Harry is on Windows; that report
does not establish the cause or applicable fix here.

Do not add service-worker keepalive polling or disable browser/security settings
without evidence: neither is justified by these results. A compact cached Reccies
summary could reduce storage payload further, but would require invalidation and
old-install fallback logic; it is not necessary to claim or implement a fix for
the still-unreproduced click delay.

## Verification

- Popup actions, layout, Meta tool selection and Reccies UI: four focused suites,
  77 tests passed. Tests include launcher wiring while settings are unresolved
  and operation without a browser feature catalogue.
- After refining the summary scheduling, reran Reccies UI, release metadata and
  popup layout: three suites, 52 tests passed. The new scheduling test verifies
  that the full-page launcher works before tab/storage responses and that the
  later summary still shows the correct assigned/outstanding counts.
- Syntax: all 220 JavaScript files passed. Git whitespace check passed.
- This step did not rerun the entire extension test suite or verify an unpacked
  extension reload/real toolbar opening. The earlier font task's full-suite and
  focused-rerun results are recorded separately in its measurement report.
- Local fonts retained, release notes updated, build metadata refreshed/staged.
  No commit or push was made.
