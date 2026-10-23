# Reccies performance changes, 23 October 2026

## Scope and behaviour

- The Prisma Reccies header now derives its outstanding count when local tracker or assignment preferences change, rather than scanning all tracker rows on each 1.5-second reconciliation. It still reconciles the live header so replaced Prisma elements can be recovered. Recreated buttons use the latest count. Unchanged text, disabled state and ARIA attributes are not written again.
- Automatic tracker updates build a duplicate-count index once per run. All tracker rows participate, including unselected and unassigned rows. Separate Map levels preserve field equality without delimiter collisions. NaN values preserve the old strict-equality behaviour. Eligibility selection changes from worst-case O(n squared) to O(n), with O(n) temporary index space. Permission checks, opt-in checks, freshness checks, preview/commit routing, recovery and tracker writes are unchanged.
- Syntax checking skips generated artifacts/extension-* directories. Original runtime sources, tests and other development scripts remain checked. This avoids rechecking packaged source copies; it does not change the extension runtime.

## Measurements

Run `node benchmarks/reccies-performance.cjs 1b78159` for the prior source or omit the commit argument for the working tree. The script executes actual source in jsdom/VM with synthetic data and mocked APIs. Automatic-write preview deliberately throws before any commit, network access or external write. Header timing is the median of five batches of 100 reconciliations after warmup. Eligibility timing is the median of five selections, including mocked storage/setup within the function. The benchmark also exercises the real DST booking scanner instead of the stub in the earlier idle benchmark.

| Work | Before, ms | After, ms |
| --- | ---: | ---: |
| Header reconciliation, 1,000 tracker rows | 0.097 | 0.044 |
| Header reconciliation, 20,000 tracker rows | 0.761 | 0.038 |
| Select all 1,000 rows for automation | 7.873 | 1.629 |
| Select all 5,000 rows for automation | 167.921 | 5.243 |
| Select 100 of 5,000 rows for automation | 16.037 | 3.696 |

Raw results are in `reccies-performance-before-2026-10-23.json` and `reccies-performance-after-2026-10-23.json`. These are synthetic measurements, not signed-in Chrome latency or a guaranteed user-visible speedup. Timings vary with JIT and concurrent machine load. The booking scanner was deliberately unchanged; its differing before/after timings demonstrate that noise, not an optimisation. Reconciliation is now independent of tracker length between storage updates; tracker/preference updates still need one O(n) count.

## Next investigation and manual verification

Check Meta still parses the actual booking table every 1.5 seconds. Safely caching that result needs reliable invalidation when Prisma edits or replaces the table, switches campaigns, or moves between Plan and Actualise. No speculative cache or observer rewiring was introduced in this batch. Capture a real Chrome trace with a populated table before deciding that implementation.

After reloading the extension and Prisma tab, check the Reccies header count after changing your person/assignment, importing or refreshing a tracker, changing a Yes status, and navigating away/back. Confirm the launcher still opens and Check Meta still appears appropriately. Automatic-write regression tests use mocks; this task did not perform an external tracker update. The delay before the toolbar popup exists remains a separate unresolved investigation.

## Verification results

Full npm test: 112 suites, 1,288 tests and one snapshot passed (269.647 seconds), with normal exit. Final focused launcher/automation/release checks: 28 tests passed. Syntax: 242 source files passed. git diff --check passed. A deliberate malformed JS file in a temporary generated-package directory was excluded by the syntax checker, and the probe was removed. A further mocked source-equivalence check matched the original duplicate predicate and row order for 300 mixed tracker rows, including unassigned duplicates (200 eligible). Build metadata was refreshed and staged. No commit or push was made.

A read-only check of an existing signed-in Prisma tab found seven rows in its canonical grid. The extension scanner is not exposed in the page execution context available to the browser tool, so no installed-scanner timing or post-reload validation is claimed. No campaign data or tracker sheet was modified.
