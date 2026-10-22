# Reccie Apps Script investigation — 22 October 2026

## Live evidence

Cloud Console denied creation under groupm.com because this account lacks
`resourcemanager.projects.create`. This is a project-setup permission blocker;
Workspace OAuth app policy was not tested. An existing accessible Cloud project
could still make the Sheets API route possible.

A standalone Apps Script project was created and deployed as Me / Only myself.
The health GET succeeded through the normal script.googleusercontent.com redirect.
This establishes signed-in browser transport, not extension-worker transport.

Project:
https://script.google.com/home/projects/1_0c8VL4xUuN5_EEwNyX5v2yG9BCJgVcwWudIY0jj6HHKQeT8T1rTTFM6/edit

Private read-only endpoint:
https://script.google.com/a/macros/wppmedia.com/s/AKfycbzQvgMmKfOf6X8F17GNagsSy0OoqNs9c_3hJPRRqXEIXQS5uYyemdpQqGYq4rFkF0-B/exec

The user explicitly approved the private project's Google Sheets scope:
“See, edit, create and delete all your Google Sheets spreadsheets.” Consent was
accepted successfully without administrator intervention. That permission is
broader than this test's fixed target, and remains granted after source cleanup.

## Actual programmatic write test

At 10:21:54–10:21:58 local time the guarded Apps Script function ran in the editor.
It checked headers, D03120200, campaign CP3G9KS, booking end 06/09/2026, no formula,
and original No, then wrote Yes, flushed and read it back, restored No in finally,
and flushed and read it back again. Only Reccie report!Q208 was explicitly written.
The sheet was reloaded independently and Q208 showed No / Saved to Drive.

Execution result:
```json
{"ok":true,"testOnly":true,"target":"Reccie report!Q208","dNumber":"D03120200","original":"No","restored":true,"error":""}
```

An earlier attempt stopped before writing with VALIDATION_CHANGED_NO_WRITE.
A read-only diagnostic showed {value:"No",formula:"",type:null,criteria:null}:
this table's dropdown does not surface as range validation. The prototype now
allows absent range validation but rejects an unexpected validation rule.

This was a server-side SpreadsheetApp write, initiated through the editor by
Codex. It was not Codex clicking the spreadsheet dropdown, a deployed POST test,
or a request from the installed Ops Toolshed extension.

Afterwards the standalone project's working source was replaced with the exact
ReadOnlyProbe.gs source and saved. Its deployed version was never changed from
the private health-only version. Test writer source remains locally for review;
there is no currently enabled web writer or production extension writer.

## Original tracker script

The temporary read-only probe file was removed from the original bound project;
Code.gs matched the captured original exactly. Manage deployments showed no
active deployment and only the pre-existing archived Testing library. No original
triggers, libraries or settings were changed. Project history can retain the
file add/remove. The inherited Toolbox external-service consent was not granted.
API/script writes do not fire onEdit, so production audit behaviour needs explicit
implementation rather than assuming the original edit trigger will run.

## Local files and verification

- ReadOnlyProbe.gs returns a fixed health marker and refuses POST writes.
- PrivateRoundTripTest.gs is a fixed-cell, test-only prototype with one-use tokens,
  locking and restoration. The live editor used a temporary doGet runner to log
  reccieRoundTrip_(); that runner was removed during cleanup.
- Ten focused Jest tests pass, including restoration failures, token replay,
  moved/formula targets, absent validation and unexpected validation rules.
- A restoration screenshot was saved as reccie-apps-script-q208-restored-2026-10-22.png
  under the task's visualization folder. Earlier Cloud/consent captures timed out.

## Remaining proof before a usable shared feature

1. Test the private health endpoint from the actual installed extension worker,
   with scoped script.google.com and script.googleusercontent.com host access;
   handle redirects, expired sessions and login HTML explicitly.
2. Test a guarded deployed POST, then a second permitted user's authentication.
   Current Only myself access does not permit colleagues to use this endpoint.
3. Choose execution identity/access restrictions with the tracker owner before
   widening deployment access. Do not distribute owner-authority credentials.
4. Build production D/campaign/month rematching, fixed tracker/tab allowlists,
   request protection, locking, preview/commit, per-row results and explicit audit.
5. Start with manual writes; only add opt-in automatic writes with fresh exact
   Prisma reconciliation/success checks after manual behaviour is proven.

No automatic updates, domain-wide sharing, or shipped extension writer is enabled.

## Identity follow-up (22 October, 11:17 local)

Version 2 of the same private deployment now contains IdentityProbe.gs, running
as Me / Only myself. A signed-in Chrome GET returned protocol 1,
identityAvailable:true, activeEmail:harry.barnes@wppmedia.com, writeEnabled:false.
No new consent prompt appeared. This proves identity for the deployment owner
only; it does not prove a colleague's identity, extension transport or remote
allowlist enforcement. Do not widen access based on this owner-only result.

A temporary Test Google connection button under Reccies > Debug requests optional
script.google.com and script.googleusercontent.com access and sends a restricted
Reccies message to the worker. The worker calls only the fixed private endpoint,
uses GET with credentials and a 20-second timeout, rejects login HTML/unexpected
origins or protocol, and returns identity and timing without storing it. No
spreadsheet reads or writes occur. This button is currently for Harry's private
pilot only, not a connection setup for colleagues. The user must reload the
extension and click it because browser tools cannot operate extension pages.

The browser identity response was inspected live. Screenshot capture timed out;
no identity-response screenshot is claimed. The prior cell restoration image
is separate evidence of the earlier write test.

Verification: connection probe suite 8 passed; Reccies UI suite 42 passed; existing Reccies core/background suite 40 passed. Syntax check passed for 214 JS files before adding the final test. Full npm test and test:diagnose runs stalled without suite output and were interrupted; no full-suite pass is claimed. Installed-worker result is pending the user's reload/button click.

