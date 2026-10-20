# Legacy code and test audit - 20 October 2026

Three independent subagent reviews covered runtime reachability, test quality, and coverage integrity. Root review covered baseline/final checks, asynchronous Stats tests, release logging, and documentation drift.

## Evidence and changes

| Candidate | Evidence | Decision |
| --- | --- | --- |
| `popup.js:addNavigationClickListener` | No calls, exports, or HTML event references; popup loads the registry and popup script. Existing navigation uses `addClickListener`. | Remove unused helper and stale removal commentary. |
| `features/approval-tracking.js:safeStorageSet` | Private inside an IIFE, never called or exported. Actual writes use retained storage paths. | Remove unused helper. |
| Stats collector observer/scheduler chain | `observeLoadingSpinner`, `scheduleLoadingCheck`, and scheduling flag have no reachable caller. | Remove disconnected chain; investigate missing integration separately. |
| Loading-time measurements | Shared monitor had no Stats subscriber; Loading Facts only updated itself. Old startup test asserted no subscription and other tests called the collector directly. | Fix shared-monitor subscription; flush/unsubscribe on pagehide and resume on pageshow. No extra MutationObserver. |
| Stats queue test sleeps | Handler already returns its queued promise, making fixed 100ms waits obsolete. | Await completion promises; preserve concurrent-submission assertions and add failed-write recovery coverage. |
| Popup source-string assertion | Declaration text did not demonstrate initialization or button behavior. | Replace with DOMContentLoaded plus actual button click and validation assertion. |
| Raw-text script execution | Content, AppLearn guard/controller, and Feature Explorer evaluated filesystem reads outside coverage instrumentation. | Use existing readScript helper for execution; retain raw source reads for static contracts. |
| Coverage denominator | Jest lacked collectCoverageFrom, omitting unexecuted production files entirely. | Include owned root/features/background scripts; exclude tooling/generated metadata. Add discovery contract for manifest, dynamic registrations, HTML scripts, and data-scripts. |
| Generated feature catalogue | Existing check failed; regeneration showed three missing feature rows. | Regenerate from current registry; check passes. |

No test suites or behavioral assertions were deleted. One test asserting the broken lack of subscription was replaced by a real-monitor transition/lifecycle regression. The new regression fails against the original collector with zero LOADING_TIME messages, then passes with the fix.

## Retained code and proof limits

Legacy Prisma redirects, old/new Orders UI support, stored Stats migration, Billing Check mode, onboarding v1/v2, confetti, PDF viewer, approver training, and live-chat enhancements have current runtime/data compatibility entry points. Names or low coverage do not establish obsolescence.

`features/campaign.js:findBasicCampaignDetailsSection` remains an unreferenced private-helper candidate. It was left unchanged to keep campaign-core changes outside the proven cleanup batch; this is a review candidate, not a confirmed runtime defect.

The three untracked `tests/helpers` files existed before this audit and were preserved. They are required by the existing Jest configuration; ensure they are included when preparing a reproducible commit.

## Verification

- Baseline: 95 suites, 1,030 tests, 1 snapshot passed.
- Focused runtime: 4 suites, 71 tests passed.
- Stats queue: 8 tests passed, including failed storage write followed by successful recovery.
- Feature contract gate: 16 suites, 276 tests passed.
- Syntax: 201 JavaScript files passed before final report creation (report is Markdown).
- Feature catalogue and whitespace checks passed.
- Final full-suite coverage: 96 suites, 1,031 tests, 1 snapshot passed; normal exit in 395.598 seconds. Full output: `coverage/legacy-audit-run.log` (ignored generated artifact).

Final reported aggregate: 78.88% statements, 67.26% branches, 78.91% functions, 83.19% lines. Active remaining gaps include `features/confetti.js` (0%) and `features/live-chat-enhancements.js` (5.88% lines). Retain these and improve behavioral tests separately.

Coverage percentages before/after this audit are not directly comparable: previously omitted active files now count. Uncovered code remains a testing gap, not evidence for deletion.

## Follow-up review and live verification

After the user reloaded the extension and Prisma, the current signed-in campaign was checked without editing campaign data:

- Plan navigation completed and the collector logged 1.16 seconds; the extension local store contained 1.158 seconds for Plan, confirming persisted measurement rather than console-only output.
- Actualise entry completed and logged 0.36 seconds. Navigation hit targets passed `elementsFromPoint`, and Close Actualisation returned to Buy without stale Actualise wrappers.
- New Orders UI loaded its row, Latest/All controls, sidebar order ID, and Order Email Copy button. Native browser pointer activation returned `Copied!` and the offscreen-confirmed success toast. Synthetic automation clicks were ignored by the existing trusted-event guard. The automation clipboard read-back returned no text, so exact OS clipboard contents were not verified.
- Campaign Approvals opened its empty-state panel and closed normally. No campaign was enrolled or submitted.
- The original Buy route was restored. Captured console warnings and an `addListener needs a callback` error originated in Mediaocean grid bundles; no extension error was captured from these checks. One deliberately attempted diagnostic in the wrong extension execution world produced a TypeError; the correct isolated content world successfully read Stats.

Independent autoreview used Codex GPT-6.1 Sol at medium reasoning, covering local staged/unstaged/untracked changes through P2 with loading monitor, content initialization, registration, Stats backend and Chrome mock context. The validated result was `scoped-clean`, with no actionable P0-P2 findings. The reviewer did not execute tests or independently inspect the installed extension. Reports are stored outside the repository in the task visualization folder (`review.txt`, `review.json`, `review-status-retry.json`). The restricted first attempt could not create its isolated temporary workspace; the same helper completed with approved host access and its isolation checks intact.

Build metadata was refreshed and successfully staged on follow-up. No commit or push was made.

## Final remaining-check pass

The following supersedes the earlier live limits above. Tests used separate campaign tabs; the user's financial edit form was not changed.

- Legacy Orders: CP2XWVQ showed the real old Orders UI (no new-UI menu), five Copy controls, and revision-suffixed IDs. Native copy returned the base Order ID exactly through the physical offscreen clipboard read; original clipboard text was restored.
- New Orders before the additional fix: CP3HFCC showed two rendered addresses plus `(1 More)`. Clipboard read proved only the two rendered addresses were copied while the UI claimed success. This was a genuine pre-existing bug, not an obsolete test.
- New Orders after the additional fix and user reload: the same overflow row displayed `Prisma is hiding email addresses. The full recipient list is unavailable, so nothing was copied.` The button stayed `Copy` and the physical clipboard was unchanged. CP3J7PD, with a complete single-recipient row, still copied exactly that address; original clipboard text was restored.
- Clipboard verification used the extension's existing verified-Prisma `getClipboardText` route, which reads through the physical offscreen service. The browser automation session clipboard was not a reliable read-back of that service.
- Popup: the user reported all native checks passed: blank-ID validation/no new tab, CP3HFCC + October 2026 opening correctly, Settings, and Release Notes/Roadmap/Stats. A new automated test also runs actual popup.html plus the real registry/popup scripts and checks real click-to-launch behavior.
- Help Guides: the user reported all checks passed: launcher, Amazon DST search/open, PDF rendering or the SharePoint fallback, close, and reopening. The exact PDF-versus-fallback branch was not specified. Native side-panel content is outside the exposed browser automation surface, so this evidence is user-reported.
- Back navigation: the isolated tab navigated to Reports and back. Chrome reported `back_forward` and `Page.backForwardCacheNotUsed` with `CacheFlushed`. Ordinary restoration returned to Prisma; a genuine cached-document restoration was not exercised. Automated pagehide/pageshow regression coverage passes.
- Before the new recipient source fix, the gate showed 4 failures / 277 passes, all failures from new recipient regressions. The original focused Order Copy suite passed 14/14; new regressions against original source showed 4 failures / 15 passes. After the fix, focused Order Copy passed 19/19, popup 23/23, and the combined feature-contract/popup/release checks passed 18 suites / 310 tests.
- A final isolated Codex review of the full candidate, including the recipient guard and its full source/tests, reported no actionable P0-P2 findings. It was static review of supplied evidence, not an independent test run. Files: `review-final.txt`, `review-final.json`, `review-final-status.json` in the task visualization folder.
- Final expanded full-coverage suite: 96 suites, 1,037 tests, 1 snapshot passed; clean exit in 329.389 seconds. Full output: `coverage/remaining-final-coverage.log`. Syntax (201 JavaScript files), generated catalogue, and whitespace checks passed. Build metadata refreshed and staged after the last behavioral source change.

## Before and after, grouped by feature or code section

| Section and changed files | Before | After and proof |
| --- | --- | --- |
| Loading-time Stats: features/stats-collector.js; tests/features/stats-collector-loading.test.js | No Stats subscription to shared spinner monitor; a disconnected observer/scheduler chain remained; a test asserted no subscription. | Shared monitor subscription, pagehide flush/unsubscribe, pageshow resume; disconnected chain removed without another observer. Original-source regression failed with zero LOADING_TIME messages, fixed tests pass; live spinner duration and persisted Plan total agree. |
| Order Email Copy: features/order-id-copy.js; tests/features/order-id-copy.test.js | A hidden-recipient row silently copied a partial list as success; cell-root full-text metadata was ignored. | Detect incomplete `(N More)` lists and leave clipboard unchanged with explicit warning. Complete text/root/descendant metadata remains supported, deduplicated case-insensitively and reread on retry. Five added test cases; blocked and successful branches verified live with physical clipboard reads. No attempt to guess the hidden address. |
| Approval tracking cleanup: features/approval-tracking.js | Private safeStorageSet helper had no calls or exports. | Dead helper removed; active writes untouched. Existing approval tests and live empty-state panel opening/closing pass; no live approval was submitted. |
| Popup cleanup/behavior tests: popup.js; tests/popup.test.js | Uncalled addNavigationClickListener and stale comments remained; source declaration text was used as initialization proof. | Unused helper/comments removed. Real initialization/click validation replaces the string assertion; added actual-popup-markup campaign/navigation integration check. 23 popup tests pass; native checks user-verified. |
| Stats backend test reliability: tests/stats-manager.test.js | Fixed 100ms sleeps and obsolete fire-and-forget comments despite returned completion promises. | Await actual queued writes; preserve concurrent submissions and add failed-write recovery test. All 8 Stats manager tests pass. Runtime backend unchanged. |
| Executed-script coverage: tests/content.test.js; tests/features/applearn-popup-guard.test.js; tests/feature-explorer.test.js | Evaluated raw filesystem script reads bypassed coverage instrumentation; an unused manifest parse remained in the AppLearn test. | Use existing readScript helper for execution; raw source contracts retained; unused parse removed. Product behavior unchanged; runtime execution now contributes to coverage. |
| Coverage denominator: jest.config.js; tests/coverage-runtime-entrypoints.test.js | Unexecuted runtime files could disappear from the report. | Explicit root/features/background collection, excluding tooling/generated metadata; new discovery contract covers manifest/static/dynamic registrations, local HTML scripts, and data-scripts. Coverage gaps remain visible rather than becoming deletion evidence. |
| Catalogue/release metadata: docs/feature-catalogue.md; toolshed.html; tests/release-metadata.test.js; build-info.js | Generated catalogue missed three registry entries; no entries describing these two genuine fixes; build date reflected prior source state. | Regenerated Loading Facts appearance, Legacy Prisma redirect, and PO autofill rows; added individual Loading Time Stats and Order Email Copy fixes; adjusted metadata tests; required build update and staging performed. |

The three untracked tests/helpers files (cleanup.js, jsdom.js, read-script.js) predated this audit and were preserved, not newly authored or removed. They are required by existing test configuration and must be included when preparing a reproducible commit.

## What still needs manual testing

Popup and Help Guides native checks are now user-confirmed; no repeat is required for this audit.

Chrome did not retain the document in its back/forward cache during the automated attempt. For additional live cache confidence, use ordinary Chrome navigation: open a campaign, navigate to Reports, press Back, then switch Plan to Buy and check that Loading Time Stats continues increasing without a large away-time jump or duplicated duration. Chrome controls whether it caches the page, so the exact cached path cannot be guaranteed by those steps. The deterministic lifecycle tests already cover the intended resubscription behavior.

Copying the full list is deliberately unavailable when Prisma hides an address from all accessible row sources. The extension now reports that limitation and preserves the clipboard; it does not claim that it recovered the missing address. No campaign changes, submissions, commit, or push were made by this audit.
