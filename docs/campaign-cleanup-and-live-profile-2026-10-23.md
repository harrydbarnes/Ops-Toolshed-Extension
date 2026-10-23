# Campaign cleanup and live Chrome profiling, 23 October 2026

## Dead-code removal

Removed 96 lines / 4,293 source bytes from features/campaign.js:

- findBasicCampaignDetailsSection: the old heuristic search for the Campaign Details Basic section.
- Its private getElementsIncludingShadowDom: called only by that unreachable helper and recursively by itself.

Both functions were private inside the campaign feature closure, absent from its exported API, and had no remaining callers. The separate live traversal helper in features/campaign-history.js is unchanged. Git history shows that commit e264a5c introduced the old date-edit approach; 9c96405 replaced its caller with the frame-aware Basic-focus relay and left the helpers behind.

The active date shortcut, frame focus implementation, message routing and permissions are unchanged. Existing campaign-navigation tests exercise opening Campaign Details, requesting Basic focus, activating the frame edit control and respecting the disabled setting. This cleanup has no claimed runtime speedup: the deleted functions were not executing. It does not remove the campaign date-editing feature and does not require a user-facing release-note entry.

## Regression gates and observer benchmark

Before removal: feature contracts passed 16 suites / 293 tests. The observer benchmark processed 80 mutation batches with two feature calls, one scheduled timer and one scheduled animation frame; elapsed time was 0.09 ms. Extension-noise mutations caused zero feature calls/timers/frames.

After removal: feature contracts passed the same 16 suites / 293 tests. Observer scheduling and call counts were identical; elapsed time was 0.05 ms, with zero extension-noise work. This tiny timing difference is noise, not evidence that deleting unreachable code speeds up reconciliation.

## Live Check Meta measurement

Recorded Chrome timeline events from an existing signed-in Buy/Digital campaign, without navigating, editing bookings or invoking a Meta API check. The canonical table contained 13 tr elements, of which 12 were body rows. The trace had 7,371 events over 36.417 seconds, completed with dataLossOccurred=false, and event delivery was not truncated.

The installed extension's actual timer callbacks were identified by their source paths and FunctionCall events. Durations below are inclusive elapsed wall time, not isolated CPU self-time:

| Installed callback | Calls | Minimum ms | Median ms | Maximum ms | Total ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| features/social-campaign-check.js reconcile | 24 | 0.479 | 1.164 | 2.107 | 26.096 |
| features/reccies-launcher.js reconcile | 24 | 0.098 | 0.216 | 0.420 | 6.015 |

Check Meta's callback includes the real booking-table scan, monitoring reconciliation and launcher work. This bounds the scan's contribution within that callback but does not separately time hasFacebookBooking. No long stall appeared in these calls. Results apply to this small rendered table, not every campaign or a synthetic 1,000-row grid. No speculative cache or update-trigger changes were introduced.

The Profiler CDP domain was unavailable. Timeline tracing worked and provided the installed callbacks, overcoming the earlier limitation of not being able to call isolated-world extension functions directly. Only aggregate timing and grid-size evidence is retained here; full captured URLs and campaign contents are not exported.

## Physical popup-click attempt and capture limit

A second trace was started before Harry physically clicked the toolbar icon. Harry reported that it opened pretty quickly, although not completely instantly. The trace enabled browser/extensions/input/latency/navigation/loading/UI categories as well as renderer timing. It contained 27,031 events over 60.627 seconds, with no delivery truncation, but only the Prisma Renderer process appeared. It contained neither popup.html/popup.js nor toolbar mouse-down/up events. Therefore it cannot establish click-to-popup latency or attribute the observed pause to Chrome or the extension. The reported multi-second case was not reproduced.

Opening chrome://tracing through the browser tool was explicitly rejected by its URL security policy (only HTTP/HTTPS navigation is allowed). No workaround was attempted. Both tab-scoped recordings were stopped. No permanent profiling hooks were added to the extension or host page.

## Remaining browser-wide capture (manual)

1. In Chrome, open chrome://tracing in a new tab.
2. Choose Record, Manually select settings, All, then Record.
3. Click the Ops Toolshed toolbar icon once, preferably when the intermittent delay occurs.
4. Return to the recorder, Stop and Save. Keep the activity short, around ten seconds where practical. Supply the saved trace for analysis, stating whether the click was quick or delayed.

These steps follow Chromium's recording guidance: https://www.chromium.org/developers/how-tos/submitting-a-performance-bug/ . A browser-wide capture can include tab titles/URLs; it should be shared privately for this diagnosis, not posted publicly. Opening popup DevTools after it appears or loading popup.html as a normal tab would not capture the missing initial interval.

After reloading the extension and Prisma tab, the remaining direct smoke check for this cleanup is that the campaign-header date edit shortcut still opens Campaign Details and focuses Basic editing. Installed post-reload verification is not claimed by the source/tests or timing trace.

## Final automated verification

Full npm test passed 112 suites, 1,294 tests and one snapshot in 343.221 seconds, exiting normally. Syntax checking passed 242 source files; git diff --check passed. Other Reccies edits/tests were added concurrently in the shared checkout and were left untouched by this cleanup. Build metadata was explicitly refreshed and staged. No commit or push was made by this task.
