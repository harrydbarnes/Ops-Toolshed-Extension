# Jett — live per-user Reccies test

## Harry — share the save-record spreadsheet first

Open https://docs.google.com/spreadsheets/d/1Z9LLDBSc747HreEWl_lP0MRBgaAR4zOhNpp0OIrIFyo/edit and use Share to add Jett’s work Google email as an Editor. He also needs edit access to the Reccie Tracker.

The save-record spreadsheet holds Requests, Changes and Records. Editor access lets Jett read and change these records directly in Google Sheets. If that is unsuitable, pause this test and arrange a different audit design.

## Update Jett’s existing extension

1. Finish any current save and close the Reccies sidebar.
2. Extract this ZIP. Open its Ops-Toolshed folder.
3. Copy the contents of Ops-Toolshed into the exact folder Chrome already loads on Jett’s laptop. Replace existing files. Keep manifest.json directly inside that existing folder.
4. Open chrome://extensions in the same work Chrome profile and click Reload on the existing Ops Toolshed card.
5. Reload Prisma and reopen Reccies. Use Refresh tracker from Google Sheet.

Keep the existing folder and extension entry to retain settings and the tracker connection. Removing the extension can clear its local data. Loading another folder can create a separate extension entry.

## Connect Jett’s own Google account

1. The new connection section is at the top of Reccies. Choose Connect my Google account.
2. Select Jett’s work Google account. Review and approve Google’s email and Google Sheets permissions. Google’s Sheets permission is broad, while the writer’s code fixes its targets to the Reccie Tracker and save-record spreadsheet.
3. Once Google authorisation finishes, return to Reccies. The Google tab may display a technical connection result.
4. Choose Check access. Confirm the connected email belongs to Jett.
5. If the sidebar reports missing access, check the Google account and share the named spreadsheet as required. Updates stay unavailable until both access checks pass.
6. Choose Use my Google account for updates.

Enabling this pauses automatic marking, post-reconciliation checking and automatic comment removal for the first test. They can be re-enabled after the manual test passes.

After activation, the server requires Jett’s own Google account for writer requests. Older builds cannot continue saving through Harry’s account for Jett. Keep this per-user test build installed for further tracker updates. An administrator must deliberately change the server setting to reverse that requirement.

## Run one genuine live test

1. Choose the report month, assignment and name. Filter to one placement Jett has genuinely reconciled.
2. Verify Reccie Status and compare its result with Prisma.
3. Choose Mark Yes in tracker. Review the live preview and any comment-removal choice before confirming.
4. Wait for the final save result. If it is pending, let the automatic receipt checks finish or use Check save result. Avoid starting a duplicate update while the outcome is unknown.
5. Open that exact tracker row. Right-click its Reccied cell and choose Show edit history.
6. Check that the new edit shows Jett’s email and the value is correct.
7. Send Harry the connected email, D number, save result and a screenshot of the new cell history entry internally.

Google’s authorisation and file permissions are enforced by Google. The server also checks the actual Google identity, its allowlist, the per-user requirement, live row identity and save receipts. People with Editor access can still edit the sheets directly in Google Sheets.

## Other extension updates included

- Save-result polling, clearer busy/expired-preview recovery, and previews that survive the background worker restarting.
- Live comments in Mark Yes, optional removal and a separate automatic-removal preference.
- Filtered rows verified first, then remaining assigned rows without automatic writes from those additional checks.
- Visible refresh action, improved report/progress synchronisation and saved search/source preferences.
- Selected name in the heading, report month and refresh timestamps, and a weekday percentage. Main Tracker uses the next month’s first five weekdays; Early Recs uses its report month.
- Delayed verification tooltip, simpler settings and red popup close buttons.

The file format and Chrome extension permissions match the existing installation. This test package changes the writer route to the per-user service. It does not require another Chrome extension entry.
