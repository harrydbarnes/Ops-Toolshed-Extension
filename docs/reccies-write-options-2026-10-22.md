# Reccies write integration options — 22 October 2026

## Goal

Users manually install the same unpacked Chrome extension. Minimise Google setup
and avoid relying on administrator access or credentials embedded in the extension.

## Live investigation (no edits or deployment)

Opened Extensions > Apps Script in the existing Ops Reccie Tracker.
The bound OpsReccieTracker project is accessible to the signed-in work account.
Its current Code.gs contains edit(e) and open(e) telemetry functions, not doGet or
doPost web-app handlers. Manage deployments shows no active deployment and an
archived Testing library deployment. New deployment exposes Web app configuration.
Execute as defaults to Me (the signed-in deploying user). The actual audience
choices shown were Only myself and Anyone within groupm.com. The work account
shown in the editor uses the wppmedia.com alias; cross-user/domain-alias behaviour
must be tested rather than inferred from the email suffix.

Cancelled the deployment dialog. Did not edit code, authorise new scopes, run a
function, deploy an app, change access or edit any spreadsheet cells in this
investigation. The earlier reversible cell-edit test is documented separately.

Access-options screenshot:
C:/Users/harry.barnes/.codex/visualizations/2026/10/20/01a159af-627d-7a20-89a7-624dc07e1949/reccie-apps-script-access-options-2026-10-22.png

## Recommended first prototype

Use an Apps Script WEB APP (doPost), not the Apps Script Execution API.
Apps Script manages a default Cloud project; this path does not need each user
to create a Cloud project or configure an OAuth client or extension ID.
Deploy once for the tracker, with domain-only access and a server-side permitted
user check. If executing as the deployer, that user's privileges apply, so the
server must restrict writes to this fixed spreadsheet, allowed report tabs and
Reccied only. Domain membership alone is not permission to change arbitrary rows.
Do not trust an email passed by the client. Server-resolved identity must be
available and permitted; reject blank/unrecognised identity. Do not use an anonymous
webhook or a shared secret bundled into every extension.

One deployer authorisation may be needed. Workspace policy can still block the
service; seeing the deployment options is not proof that deployment/authorisation
will succeed. The extension needs optional host access for script.google.com and
script.googleusercontent.com, because ContentService follows a Google redirect.
Test background fetch from the actual extension with existing Google sign-in,
correct-account selection, login/error detection, and a second permitted user.
Do not equate a successful visible browser edit with this background test.

A stable service URL can be distributed with all manually installed copies. It
is an HTTPS endpoint, not an OAuth client tied to an extension ID. Expected user
flow is install extension, allow the tracker connection, sign into the work Google
account if needed, then use per-D or campaign marking. No tracker tab should need
to stay open if authenticated background requests work in the test.

For write operations, rematch D number, campaign ID and report month live, preserve
validation/formulas/formatting, update only Reccied to Yes, reject duplicates and
ambiguous matches, lock concurrent writer requests, and return per-row results.
Use a server-issued anti-forgery/operation token rather than relying only on cookies.
Use one writer for manual actions, opt-in post-verification writes and later
post-financial-update checks. Manual marking is user attestation; automatic marking
requires a fresh unique Prisma result with Reconciled Yes and Buy status SUCCESSFUL.

Existing edit(e) code logs Q-column changes through Toolbox. Script/API writes do
not trigger onEdit automatically; preserve required logging explicitly when the
write service is implemented. Do not assume past cell restoration erases logs.

## Alternatives

- Sheets API/OAuth: supported and scalable; needs one developer setup, not one
  project per colleague. A shared public manifest key can stabilise unpacked
  extension IDs across installation folders. More initial setup than this web app.
- Apps Script Execution API: needs a common standard Cloud project plus OAuth;
  does not remove the setup burden, so avoid it for this requirement.
- Automated Sheets UI: uses existing sign-in but is fragile and needs an open
  spreadsheet. The Codex dropdown test did not establish an extension UI bridge.
- Replaying Google's private /save traffic: observed during the earlier test,
  but not a documented supported API; no implementation or replay was attempted.
- Forms and published CSV endpoints: no verified supported edit-existing-row
  write path was found for this workflow.

## Primary references

https://developers.google.com/apps-script/guides/web
https://developers.google.com/apps-script/manifest/web-app-api-executable
https://developers.google.com/apps-script/guides/cloud-platform-projects
https://developers.google.com/apps-script/guides/content
https://developers.google.com/apps-script/reference/base/session
https://developers.google.com/apps-script/api/how-tos/execute
https://developers.google.com/apps-script/guides/triggers/installable
https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
https://developer.chrome.com/docs/extensions/reference/manifest/key


## Follow-up: actual permissions check and prototype

The work account's Cloud resource picker explicitly denied
resourcemanager.projects.create in groupm.com. The Sheets API/OAuth route needs
an organisation project owner/admin to provide a suitable project or grant that
permission. This does not establish whether Workspace app-consent policy would
also require approval: project creation was the first blocker.

A standalone minimal Apps Script probe was nevertheless created and privately
deployed without admin help or an additional scope grant. Its live response
confirmed the health protocol. Prefer a separate narrow service rather than
inheriting the existing Toolbox library's external-service permission request.
See integrations/reccie-apps-script/README.md for verified URLs, test coverage,
cleanup, the pending Google Sheets consent screen and remaining proof boundaries.
