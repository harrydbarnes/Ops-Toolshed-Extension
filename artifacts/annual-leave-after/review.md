# Annual Leave UI check

Question: how do I save calendar defaults once, then prepare events for requested leave?

This is a local component/layout refinement. No new direction was drawn: the existing
Ops Toolshed palette and Segoe UI typography are retained, following the skill's
component exception. The reusable title and invitees are the product-specific preview.

- Before: defaults followed the leave-date editor; the phone title was 32px.
- After: setup comes before dates, starts expanded, and collapses after complete defaults
  are saved. The title is 24px. Only Save setup carries a filled accent.
- Inspector: before 0 failures / 1 warning; after 0 failures / 0 warnings at 1440, 768,
  and 390px. All fold screenshots and full-page contact sheets were inspected.
- The main task reads in source order, section edges align, and the layouts have no
  horizontal overflow. Narrow layouts stack fields and actions with legible labels.
- There are no invented metrics or charts. Preview dates and Example User are explicitly
  labelled illustrative by the local preview server, never saved to the extension.
- The notice shadow is intentional: it belongs to a genuinely floating Workday overlay.
- Remaining boundary: the preview uses an in-memory Chrome API mock; signed-in Workday
  validation is recorded separately in the live screenshots. Calendar-client imports
  were not part of this layout fix.

## Signed-in Workday checks

- User authorised one full day of Annual Leave on 16 November 2026. Submitted once;
  Workday displayed `Success! Request Submitted`, and its Requests list contains the
  date with `Total 1 Day` and `Submitted`.
- The automatic `Open calendar helper` action appeared immediately on Submit, with an
  unobstructed `elementsFromPoint` hit target. The real success message is an h2 inside
  a dialog, not a status/alert. That exact markup now has a regression test.
- The submitted request has a 110px `Calendar files` action whose hit target was verified
  in the compact Requests pane. Sick leave and birthday leave get no annual-leave action.
- Final preview action measured 157px in a 456px container, outside the scrolling area,
  with `elementsFromPoint` resolving to the button. The temporary sizing selection was
  cancelled; no second absence request was submitted.

## 27 October: direct calendar request and footer

- Inspected the signed-in large calendar: its cells use `data-automation-id="calendarDateCell-10-10"`,
  `data-automation-selected="true"`, and a full-date aria-label. The popup calendar uses a
  different selector. The earlier fixture did not represent that difference.
- The direct request uses `simpleRequestStep`; selected full dates remain in the owned
  Manage Absence calendar behind the dialog. Capture now supports that structure even
  when the helper starts with the dialog already open, while verifying the native day count.
- Reloaded the extension and Workday. Selected 10 November only for inspection and opened
  Request Absence without submitting. The calendar preview appeared before opening the form,
  and the form preview appeared at the left of the native footer.
- `workday-direct-calendar-final.png` records the final source after reload. Its preview
  is visible, has no horizontal text overflow, remains inside the viewport, and its centre
  hit target resolves to the preview button. Native Cancel and Submit remain visible.
- The helper footer uses 4px corners, a compact single-line `Calendar files` label,
  and a 40px height matching native Cancel. Its accessible label remains `Preview calendar files`. A scoped
  maximum height keeps the native form's scrolling content above its footer on short windows.
- No leave request was submitted during these checks. The open request remains unsubmitted.
