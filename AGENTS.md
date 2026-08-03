# Project Rules & Agent Protocol

## 🚨 Critical Workflow: Build Info Updates
**Context:** This project uses `build-info.js` to display the current "Build Date" and "Commit ID" in the extension UI (Settings & Roadmap pages).

**The Rule:**
Before creating **ANY** commit, pushing a branch, or marking a task as "Complete", you **MUST** perform the following update sequence:

1.  **Run the update script:**
    ```bash
    npm run update-build
    ```
    *(This updates `build-info.js` with the current timestamp).*

2.  **Stage the file:**
    ```bash
    git add build-info.js
    ```
    *(This ensures the updated date is actually included in your commit).*

**Why is this mandatory?**
If this step is skipped, the "Build Date" seen by users will remain "stuck" on the previous version, causing confusion. Do not rely solely on the pre-commit hook; explicitly run this to ensure success.

## Environment Setup
* Ensure the `.husky/pre-commit` hook is executable:
    ```bash
    chmod +x .husky/pre-commit
    ```

## Project Architecture

This is a Manifest V3 Chrome extension with no compile step. The repository root is the unpacked extension directory.

- `manifest.json`: permissions, content-script order, web-accessible resources, and extension entry points.
- `background.js` and `background/`: service-worker behavior, alarms, popup interception, and extension-wide messaging.
- `content.js`, `content.css`, and `features/`: Prisma/Mediaocean page enhancements injected by the extension.
- `popup.html` / `popup.js`: toolbar popup and launcher tools.
- `settings.html` / `settings.js`: extension options and feature toggles.
- `toolshed.html` / `toolshed.js`: release notes, roadmap, Stats dashboard, and feedback entry point.
- `approvers.html`, `approvers.js`, and `approvers-data.js`: approver search, favourites, copying, and maintained approver data.
- `tests/`: Jest/jsdom tests, Chrome API mocks, security tests, and feature-specific regression coverage.

When adding a content feature, keep `manifest.json` script ordering in mind. Features may depend on `utils.js`, shared feedback code, or DOM changes made by an earlier script.

## Prisma UI Conventions

Prisma is a dynamic single-page application and frequently replaces parts of its DOM during route changes.

- Do not assume that an element reference or one-time event listener will survive navigation.
- Prefer delegated event handlers, idempotent render functions, and narrowly scoped `MutationObserver` usage.
- Re-query the live DOM before moving or updating controls.
- Treat Plan and Actualise as separate UI states and verify both the transition into Actualise and the Close transition back.
- When adding full-width overlay or toolbar elements, verify hit targets with `document.elementsFromPoint()` so transparent containers do not block native Prisma controls.
- Keep injected selectors and class names prefixed or otherwise specific enough to avoid colliding with Mediaocean styles.

## Feature and Test Map

Run the smallest relevant test first, followed by the full suite when the change has cross-cutting effects.

| Area | Primary source | Targeted tests |
| --- | --- | --- |
| Campaign header, navigation, tab title, Actualise, name copy | `features/campaign.js`, `features/campaign-tab-title.js`, `background/message-handlers.js`, `content.css` | `tests/features/campaign-navigation-ui.test.js`, `tests/features/campaign-budget-route.test.js`, `tests/features/campaign-tab-title.test.js`, `tests/background.test.js` |
| Order controls | `features/order-id-copy.js`, `features/order-view-toggle.js` | `tests/features/order-id-copy.test.js`, `tests/features/order-view-toggle.test.js` |
| AppLearn overlay and popup blocking | `features/applearn-replace.js`, `background.js`, `settings.js` | `tests/features/applearn-replace.test.js`, `tests/background.test.js`, `tests/settings-applearn-popup.test.js` |
| Approver workflow | `features/approver-pasting.js`, `approvers.js`, `approvers-data.js` | `tests/features/approver-pasting.test.js`, `tests/workflow-centering.test.js`, `tests/security/approvers_xss.test.js` |
| Actualise bulk export and Max Campaign Budget | `features/actualise-export-all.js`, `features/max-campaign-budget.js` | `tests/features/actualise-export-all.test.js`, `tests/features/max-campaign-budget.test.js` |
| Stats and Toolshed | `features/stats-collector.js`, `toolshed.js`, `toolshed.html` | `tests/stats-manager.test.js`, `tests/toolshed-stats.test.js` |
| Feedback modal | `features/feedback-modal.js`, `features/feedback-modal.css` | `tests/features/feedback-modal.test.js`, `tests/features/feedback-modal-styles.test.js` |
| Loading facts and GMI chat | `features/loading-facts.js`, `features/gmi-chat.js`, `content.css` | `tests/features/loading-facts.test.js`, `tests/features/gmi-chat.test.js`, `tests/workflow-centering.test.js` |
| Reminders | `features/reminders.js`, `settings.js`, `content.js` | `tests/features/reminders_logic.test.js`, `tests/content.test.js`, `tests/security/reminders_xss.test.js` |
| Offscreen clipboard and audio | `offscreen.js` | `tests/offscreen.test.js` |
| Content-script wiring | `manifest.json` | `tests/manifest-script-order.test.js` |

Useful commands:

```bash
npm test
node node_modules/jest/bin/jest.js --runTestsByPath tests/toolshed-stats.test.js --runInBand --coverage=false
```

### Prisma Refactor Regression Gate

Before and after changing `content.js` reconciliation, route gating, campaign navigation,
Orders UI detection, content-script/frame injection, or protected clipboard routing:

1. Run `npm run test:feature-contracts`. This is the mandatory user-facing feature gate.
2. For performance work, capture `npm run benchmark:prisma-observer` before the change and
   again afterwards; report both results rather than only the final measurement.
3. Run the full Jest suite after the focused gate passes.
4. Reload the extension and smoke-test a legacy Orders campaign, a new Orders campaign,
   Plan, Actualise, campaign/header copy actions, Approver Widget placement, and Help Guides.

`tests/settings-feature-toggle-contract.test.js` must discover every checkbox shown on the
Features tab. A new visible toggle is incomplete until the contract includes its storage key,
default, and real click-to-persist behavior. Do not weaken route-lifecycle assertions merely
to preserve a performance optimization; feature owners must be reconciled so they can remove
stale controls after Prisma swaps DOM or Orders UI generation in place.

Do not use `--forceExit`; it can hide leaked timers or unclosed JSDOM windows. If Jest does not exit, rerun the affected suite with `--detectOpenHandles`, close every manually created JSDOM window, and report incomplete verification honestly.

## Browser Verification

- Reload the unpacked extension from `chrome://extensions` after source changes.
- Reload the target Prisma/Aura tab so updated content scripts are injected.
- Use the existing signed-in Chrome session for live Prisma checks when available.
- Verify both the expected visual placement and the actual clickable hit target.
- Check the browser console, but separate pre-existing Mediaocean warnings from extension regressions.
- Temporary DOM/CSS experiments used for diagnosis must be implemented in source and rechecked after a reload before they count as final verification.

## Change Discipline

- Preserve unrelated working-tree changes; do not reset or overwrite user work.
- Make the smallest change that fixes the requested behavior.
- Add or update a regression test whenever the behavior can be represented in Jest/jsdom.
- Keep `README.md` user-facing. Put implementation and agent workflow guidance here in `AGENTS.md`.
- `toolshed.html` is the source of truth for the in-extension release notes and roadmap.

### Release Notes Logging

- Add every new feature and user-visible improvement to the current release notes.
- List medium and major fixes individually with concise wording that clearly describes the main fix.
- Do not add a separate release-note item for every tiny fix. Instead, add or update one entry beginning `Other minor fixes, such as ...` and include only two or three concise representative examples.
- Reuse the existing `Other minor fixes, such as ...` entry for the current release rather than creating duplicates.
- Keep release-note entries ordered as New, Improved, then Fixed.
- The grouped minor-fixes entry is only for genuinely small changes; main fixes must remain individually listed.
