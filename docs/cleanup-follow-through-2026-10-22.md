# Evidence-led cleanup, 22 October 2026

## Applied

- Removed the unreferenced 9,594-byte icon-backup.png and obsolete CSS selectors from style.css, settings.css, toolshed.css, social-finance.css and content.css. Repository searches across runtime JS/HTML/CSS found definitions only. Shared social-finance selectors retain the live api-range branches; the vibrate keyframes retain their live callers.
- Removed two explicit Mediaocean host entries covered by the existing wildcard. Kept activeTab, the registry and CommonJS test exports. Kept both onboarding tours.
- Replaced the copied formatter in tests/format_time.test.js with fourteen real toolshed.js storage-to-DOM cases, covering precision, boundaries and hour formatting. Did not delete behavioural, security or style regression coverage to reduce test count.
- Replaced Approvers CDN Font Awesome CSS with local SVG masks. Existing class changes still select outline/filled stars and up/down chevrons. Search, star, chevrons and spreadsheet artwork are small project SVGs; the existing licensed bullhorn asset is reused. Removed the remaining remote stylesheet origin from extension CSP. Release notes extend the existing offline-assets entry.
- Added scripts/package-extension.cjs and tests/runtime-package.test.js. Run node scripts/package-extension.cjs on Windows to create a timestamped unpacked folder and ZIP under artifacts. Runtime root files and assets/background/features/vendor are included; development configuration, tests, docs, outputs, node_modules and integration server code are excluded. Both onboarding tours and bundled-font licences are retained. Generated snapshots are ignored by Git.

## Performance decision

benchmarks/launcher-idle.cjs executes each actual 1.5-second callback 1,000 times after 100 warmup iterations on a static jsdom campaign DOM and a home DOM. It uses empty stored tracker/check data and mocked extension APIs. It is not browser CPU, wake-up, rendering or signed-in Prisma evidence. The first run estimated combined campaign callback work at about 4.2 ms/minute; the saved repeat estimated about 2.8 ms/minute. Each callback is scheduled 40 times/minute per active page. No performance code was changed, so there is no after-change performance claim. These small synthetic costs do not justify lifecycle rewiring or explain seconds of delay before the toolbar popup exists.

Background source also disproves the audit's claim that both storage reads happen on every loading-status update: redirect settings are read only for a matching legacy URL, and shortcut settings only when changeInfo.url exists. Caching remains deferred pending evidence of meaningful cost. The unused private campaign helper and broad parser/toast/shadow-DOM centralisation are left for a separately scoped change; this batch avoids campaign runtime edits.

## Verification boundaries

Local Chrome preview uses simulated Chrome storage. Outline/filled stars, search filtering, favourites-only state and disclosure class/mask changes were checked there. This does not prove installed extension storage or a signed-in Prisma route lifecycle. The Reccies cold-start fix and toolbar click-to-document delay still require installed-extension verification after reload. The available browser interface cannot reload the installed extension. The ZIP is a review snapshot of the current shared checkout, including unrelated in-progress Reccies work; it is not an approved distribution release.

Initial ZIP: 176 files, 4,847,064 uncompressed bytes; 1,734,579 compressed bytes. Direct ZIP inspection found manifest.json at root and zero development-directory entries (177 archive entries including a directory entry).

Validation: full npm test passed 112 suites, 1,280 tests and one snapshot (294.676 seconds). Focused formatter/popup/font checks passed 19 tests; package/release/Approvers security checks passed 10 tests; final Social Finance UI and Approvers search-clear checks passed 22 tests. Syntax and git diff --check passed. A first focused invocation used a nonexistent social-finance-layout test filename; reran the actual social-finance-ui suite successfully. No commit or push was made by this task. Build metadata was explicitly refreshed and staged.
