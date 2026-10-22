# Ops Toolshed Google Identity Pilot — ready-to-test package

The service is already deployed and its address is built into version 0.1.1.
There is no Apps Script setup, URL entry, key or full Ops Toolshed installation.

## Remote session: exact steps

1. Send your colleague ops-toolshed-identity-pilot.zip through your normal internal
   file-sharing channel. Have them extract it to a normal local folder.
2. Use their work Chrome profile, with their normal work Google account signed in.
3. Open chrome://extensions. Turn on Developer mode (top right), click Load
   unpacked, then select the extracted **extension** subfolder — the folder with
   manifest.json. Do not select the ZIP or the main Ops Toolshed repository.
4. Open Chrome's Extensions puzzle menu. Click **Ops Toolshed — Google Identity
   Pilot** (pin it if useful).
5. Enter **their work Google email**. This is only a local comparison and is not
   sent to the server or saved.
6. Click **Test Google connection**. Keep the popup open until it finishes. It
   makes three sequential calls, each with a 20-second limit.
7. Expected: **Passed: Google identified your account; supplied email ignored;
   POST refused.** The results must show THEIR email, not Harry's.
8. Click **Download result (.json)** and send the file to Harry. Repeat once on
   Harry's laptop too, so Codex can compare the two results.

If there is a sign-in/access error: click **Open Google service**, check/select
that colleague's work account in Google if asked, then reopen the popup, enter
 their email again and retry. There is no need to grant Sheets or Drive access.
Record any policy or permission screen rather than bypassing it. If Developer
mode/Load unpacked is blocked by company policy, stop and report that.

A failed test can still produce downloadable JSON if the server returned the
correct protocol. For a network/login error, send the displayed error or screenshot.
The result includes work email, timings, nonce and technical checks, not cookies,
credentials, tokens, tracker rows or Prisma data. Share results only internally
and with Codex for this task.

## What the three tests establish

- Google session identity: obtains the active user's email from Google on the server.
- Supplied email ignored: repeats the GET with forged-user@example.invalid in the
  request. The result must still be the real Google identity.
- POST refused: sends a deliberately unsupported operation. The identity-only
  service returns READ_ONLY_PROBE; it has no spreadsheet code to execute.

A successful colleague result supports caller identification for owner-run
services within this Workspace. It does not prove production tracker writes,
per-user allowlists, signed-out handling or accounts outside this Workspace.
Blank email, Harry's email on the colleague's laptop, a returned forged email or
accepted POST means the pilot has NOT passed.

## Cleanup

After exporting results, remove the pilot extension from both laptops using
chrome://extensions. No account data is saved in extension storage. Downloaded
JSON remains until you delete it.

Harry can disable the shared service using Apps Script > Ops Toolshed Identity
Pilot > Deploy > Manage deployments > Archive. This project is separate from the
original tracker script and earlier private transport test. The approved access
is Anyone within groupm.com; it is not anonymous/public access.

## Deployment and verification record

Project:
https://script.google.com/home/projects/1hBhVjO7xtrGya8h5CFAOSl1FVs60qk72jZpmxvpLK0HZ4QM2rcO5w43T/edit

Deployed version 1, 22 October 2026, 11:53 local; execute as Harry's work account;
access DOMAIN (Google UI: Anyone within groupm.com). User explicitly approved
this scope during setup. Explicit OAuth scope: userinfo.email only. Google's
consent screen displayed Email address; no spreadsheet authorisation requested.

Service address is in extension/config.js. Browser GET with a forged email
returned Harry's genuine Google email, identityAvailable:true, writeEnabled:false
and the matching nonce. This is owner-account browser evidence; the newly packaged
extension and a colleague's account still need the remote test described above.
Local worker/server tests cover the protocol and rejection behaviour; they are
not evidence of colleague access. apps-script/ contains the source for review,
not setup work for your colleague. Google added webapp executeAs/access fields
when deploying; the source manifest retains only the explicit identity scope.
