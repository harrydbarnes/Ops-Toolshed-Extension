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
| Campaign header, navigation, and Actualise | `features/campaign.js`, `content.css` | `tests/features/campaign-navigation-ui.test.js`, `tests/features/campaign-budget-route.test.js` |
| Order ID copy | `features/order-id-copy.js` | `tests/features/order-id-copy.test.js` |
| AppLearn overlay | `features/applearn-replace.js`, `settings.js` | `tests/features/applearn-replace.test.js` |
| Approver workflow | `features/approver-pasting.js`, `approvers.js`, `approvers-data.js` | `tests/workflow-centering.test.js`, `tests/security/approvers_xss.test.js` |
| Stats and Toolshed | `features/stats-collector.js`, `toolshed.js`, `toolshed.html` | `tests/stats-manager.test.js`, `tests/toolshed-stats.test.js` |
| Feedback modal | `features/feedback-modal.js`, `features/feedback-modal.css` | `tests/features/feedback-modal-styles.test.js` |
| Reminders | `features/reminders.js`, `settings.js` | `tests/features/reminders_logic.test.js`, `tests/security/reminders_xss.test.js` |

Useful commands:

```bash
npm test
node node_modules/jest/bin/jest.js --runTestsByPath tests/toolshed-stats.test.js --runInBand --forceExit --coverage=false
```

Jest can occasionally take a long time to exit in this OneDrive-backed checkout even with `--forceExit`. Distinguish a runner/process-exit problem from a failed assertion, and report incomplete verification honestly.

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
