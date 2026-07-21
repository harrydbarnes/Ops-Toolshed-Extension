# Meta Ads Manager `Default Custom View`

This note records the Ads Manager interface behaviour observed while copying the
`Default Custom View` preset between ad accounts. It is also the implementation
contract for any future extension-assisted setup.

## Intended column order

The preset is saved separately for each Meta ad account. Its columns should be:

1. Campaign
2. Campaign ID
3. Delivery
4. Tags
5. Actions
6. Budget
7. Amount spent
8. Impressions
9. Reach
10. Schedule
11. Starts
12. Ends
13. Bid strategy
14. Last significant edit
15. Ad set name
16. Account name
17. Account ID
18. Buying type
19. Reporting starts
20. Reporting ends

If `Schedule` is not available for an account, omit it. Do not substitute `Ad
schedule`: that is a different field. The valid fallback preset therefore has 19
columns in the same relative order.

## Manual setup flow

1. Open the account in Ads Manager at campaign level.
2. Open the **Columns** menu, then choose **Customise columns**.
3. Add the required columns and remove all other columns.
4. Reorder the selected columns to match the list above.
5. Open the save options beside **Apply** and save the preset as
   `Default Custom View`.
6. Apply the preset and confirm that the Columns control shows
   `Default Custom View`.

Success is not just the presence of a saved preset. Confirm the selected column
count and exact order before saving: 20 columns normally, or 19 only when
`Schedule` is unavailable.

## Ads Manager interface observations

- Presets are account-specific rather than shared automatically across every ad
  account in a business portfolio.
- The Columns menu has appeared in more than one UI form: saved presets can be
  exposed as radio controls or as selectable list items.
- The Customise columns search control can be represented as either a textbox or
  a combobox.
- Search results can be rendered inside the main dialog or in a separate
  listbox. Some results include scope labels such as `Campaigns only`, `Ad sets
  only`, or `Ads only`.
- The initial Performance preset is not consistent between accounts, so an
  automation must inspect the selected list instead of assuming a starting
  column count.
- The selected-column list is virtualised. Rows outside the visible area may not
  exist in the DOM until the list is scrolled.
- Ads Manager frequently replaces React-rendered elements after clicks,
  searches, account changes, and scrolling. Element references must be queried
  again after each state change.
- `Schedule` is not exposed in every account. At least one account offered only
  `Ad schedule` when searching for it.

## Proposed extension-assisted setup

The safest user flow is deliberately account-by-account:

1. The user opens the required account's Campaigns page in Meta Ads Manager.
2. The user opens Ops Toolshed and clicks **Set up Default Custom View**.
3. The extension checks that the active tab is an Ads Manager Campaigns page,
   displays progress, and configures that account only.
4. It verifies the final ordered list and reports one of:
   - `Default Custom View set up with 20 columns.`
   - `Default Custom View set up with 19 columns; Schedule is unavailable for this account.`
   - A clear stopped/error state without saving a partial preset.

This can follow the existing Meta Billing Check pattern: a popup click sends a
message to the service worker, which uses `chrome.scripting.executeScript` on the
active tab. The manifest already grants `activeTab` and `scripting`, so the first
prototype should not need a permanent Ads Manager host permission.

The injected setup routine should be a small, observable state machine rather
than a fixed sequence of delays. At each stage it should re-query the current
dialog, require one unambiguous target, wait for the expected next state, and
stop on an unsupported UI variant. It should also be idempotent: if the preset
already exists, verify it and repair it only when necessary.

Do not automate switching through every account. Keeping account selection as a
manual user action prevents the extension from editing the wrong account and
makes failures easy to recover from.

## Prototype risk to resolve

Adding and removing columns can probably be driven through normal DOM controls.
Reordering is the uncertain part: Meta may reject synthetic drag events because
they are not trusted user input. Before shipping, prototype reordering against
the live interface and look for an accessible keyboard or button-based reorder
mechanism. Avoid adding the broad `chrome.debugger` permission solely to force
mouse dragging. If reliable reordering is not possible, the helper should add
and remove the correct fields, then clearly ask the user to finish the ordering
manually before it saves anything.

There is no supported Meta Marketing API for managing Ads Manager's saved column
presets. The feature should use visible page controls and must not depend on
Meta's private GraphQL or other internal endpoints.
