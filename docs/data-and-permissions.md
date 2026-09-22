# Data, permissions and privacy

This describes what Ops Toolshed 1.9 does in the browser. It is intended for company rollout review; it does not replace the company's data-handling policy.

| Data | Where it goes | When and why | User control |
| --- | --- | --- | --- |
| Feature choices, onboarding profile, reminder day/time and custom reminder text | `chrome.storage.sync` in the signed-in Chrome profile, subject to Chrome Sync settings | Saves preferences across extension pages and potentially devices | Change or reset Settings; review Chrome Sync policy |
| Campaign names, IDs, client and supplier details, visited URLs and visit counts | `chrome.storage.local` | Campaign History and approval tracking | Disable History logging, clear History, or dismiss approval records |
| Approver favourites and recently removed/submitted recipient addresses | `chrome.storage.local` | Approver search and approval workflow convenience | Manage favourites and recipient history in the tool |
| Meta Graph API access token and finance-tool references | `chrome.storage.local` | The optional Social Booking Checker uses the token in requests to `graph.facebook.com` | Remove the token in Social Booking Checker; avoid shared Chrome profiles |
| Uploaded report contents and reconciliation results | Processed in the extension page; some saved reference data may be in `chrome.storage.local`; exported files are written to the user-selected download location | Social Booking Checker comparison and export | Clear source/reference data in the tool and delete exported files when no longer needed |
| Stats and Diagnostics Mode events | `chrome.storage.local`; exported files only when the user chooses export | Local usage views and fault investigation; diagnostic events may include a campaign ID | Disable/reset Stats; Diagnostics Mode expires after 24 hours or browser restart and can be cleared sooner |
| Current campaign status | Mediaocean campaign API using the user's signed-in browser credentials | Approval tracking polls submitted campaigns every five minutes when enabled for a Prisma booker | Disable Approval Tracking or choose the non-Prisma profile |

The extension has no separate analytics endpoint. That does **not** mean it runs offline: Prisma features use Mediaocean, Help Guides open company SharePoint, the optional Social Booking Checker contacts Meta, and some extension pages request font or stylesheet assets from public CDNs. Those CDN requests expose ordinary request metadata such as IP address; they are not sent campaign records by the extension's code. A Meta token is masked in the form but stored as a recoverable value in local extension storage, not encrypted by this extension.

The manifest requests broad Mediaocean host access for Prisma pages and the campaign API, SharePoint access for guides, and Meta Graph API access for the optional finance tool. `storage`, `alarms` and `notifications` support preferences and reminders; `scripting`, `tabs` and `sidePanel` support injection and navigation; `clipboardRead`, `clipboardWrite` and `offscreen` support explicit copy and paste actions. Access to the system clipboard can expose sensitive content while a user invokes one of those actions. The extension should only handle that content for the requested action.

For rollout, use company-managed Chrome profiles, apply the appropriate retention policy to downloads and exported diagnostics, and review whether external font/CDN requests are permitted. Recheck this inventory whenever a feature adds a storage key, endpoint, permission or export.
