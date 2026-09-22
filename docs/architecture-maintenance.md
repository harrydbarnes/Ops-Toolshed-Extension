# Feature architecture maintenance

The rollout fixes moved serialized approval storage writes into `background/approval-store.js`. The poller now owns network checks and approval transitions, while the store owns write ordering. `feature-settings-registry.js` owns the feature catalogue used by Settings, the explorer and generated documentation; `toolshed.html` owns release history.

The largest remaining modules still combine several concerns. Split them incrementally after live regression coverage exists:

| Module | Extract next | Preserve while changing |
| --- | --- | --- |
| `features/campaign-history.js` | Pure campaign metadata parsing and storage normalization, then panel rendering and navigation observer | Shadow DOM navigation replacement, account-location keys, supplier capture, search, context menu and large-grid observer behavior |
| `features/approver-pasting.js` | Recipient matching/entry and history persistence from sidebar rendering | Select2 timing, duplicate recipients, manual typing, clipboard preservation and approval submission state |
| `social-finance.js` | CSV schema parsing, reconciliation calculations and Meta API credentials into tested modules | Uploaded report compatibility, token clearing, all totals and export formats |
| `settings.js` | Feature search/preview rendering and reminder controls | Existing storage keys/defaults and every visible toggle's click-to-persist contract |

Do not split these modules solely by line count. Move one behavior at a time behind a testable interface, keep content-script order explicit in `manifest.json`, and rerun the feature-contract gate and a signed-in Chrome smoke test after each change. The current performance gate covers central Prisma observer scheduling and a Campaign History grid-mutation regression; the signed-in Chrome Performance comparison in [rollout validation](rollout-validation.md) remains necessary before company-wide release.
