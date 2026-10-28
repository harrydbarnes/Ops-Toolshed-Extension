# Outlook calendar connection investigation

Date: 27 October 2026

## Finding

Microsoft Graph can create all-day events in the signed-in user's Outlook calendar, including separate Free and Busy events. A delegated `Calendars.ReadWrite` permission is required. Creating an event with attendees sends invitations immediately; this API does not provide a send-later switch. A connected workflow must present the exact dates and invitees before the user chooses to create and send the team invite. The personal ICS and assistant prompt can remain independent.

Sources: [Create event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0), [Event properties](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0).

## Authentication and deployment

- The extension currently has no Microsoft identity integration, Graph host permission or Microsoft app registration in its manifest. An Entra application registration, approved redirect URI and a stable extension ID are prerequisites.
- Chrome's `identity.launchWebAuthFlow` can capture the provider's redirect at `https://<extension-id>.chromiumapp.org/`; OAuth authorization code with PKCE should be investigated and tested for the chosen Entra application type. Do not embed a client secret in the extension. Registration type, redirect configuration, CORS and extension origin behavior need a proof of concept in the target tenant.
- Add permissions only for the opt-in connection, and request delegated access to the signed-in user's calendar rather than application-wide mailbox access. The tenant may require administrator approval: Microsoft's recommended managed consent policy excludes `Calendars.ReadWrite` from end-user consent.
- Sources: [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity), [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Entra consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies).

## Suggested next implementation

1. Obtain an approved registration and verify consent in a non-production test account. Do not reuse a client ID belonging to another application without approval.
2. After a confirmed Workday submission, display editable dates, titles and recipients. The user explicitly chooses whether to create the Busy blocker and send the team invite. Never send merely because Workday submitted.
3. Create one event per contiguous block and purpose, using all-day start and exclusive end at midnight in the same supported Outlook time zone. Use `showAs` Free for the invitation and Busy for the blocker. Check which personal calendar is selected.
4. Persist a per-block operation record and stable transaction ID before each create; record Graph event IDs and web links on success. Transaction IDs help with retries but are not a general guarantee against all later duplicates. If a response is ambiguous, surface that uncertainty and check the existing result before any retry; never silently repeat an invite.
5. Display individual outcomes and recovery actions. Verify user cancellation, expiry, account changes, partial failures, timeout-after-success and repeated clicks. Verify both Outlook UI and attendee behavior with explicit authorization before claiming live success.
6. Leave edits or cancellations manual initially; a later sync feature must rematch the user's event and obtain confirmation before changing or deleting it.

## Tenant policy check

On 27 October 2026, a read-only check in the signed-in `insidemedia.net` Entra tenant showed:

- **Users can register applications: No**, under Entra ID > Users > User settings. The account's Entra overview showed no assigned roles. An authorised administrator or app owner would therefore need to arrange a registration or explicitly grant an appropriate exception.
- **Users can request admin consent to apps they are unable to consent to: No**, under Enterprise applications > Consent and permissions > Admin consent settings. The built-in request workflow is disabled; use the organisation's normal IT/security request channel.
- The **User consent settings** page returned **You don't have access**, error 401. Whether a user can consent to this particular `Calendars.ReadWrite` permission, or whether an administrator must grant it, remains unverified. The permission-classification page displayed no delegated permissions classified Low, but that alone does not establish the active consent policy.

No application was registered, permissions granted, calendar event created or invitation sent. No tenant policy was changed.
