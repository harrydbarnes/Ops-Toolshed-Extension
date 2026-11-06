# Windows Security block while using Prisma

On Harry's laptop, Defender event 1126 identifies repeated Chrome connections blocked on 5 November 2026, including 16:53:09 UK time, to:

https://pendo-static-6197323200987136.storage.googleapis.com

The extension's runtime source has no Pendo or storage.googleapis.com references. The hostname suggests Pendo content used by a website. This does not establish which tab or script initiated the request, or whether it is a false positive.

## Message for IT

While browsing Prisma in Chrome, Windows Security reports “This content is blocked as phishing” for storage.googleapis.com. Defender's Operational log, event 1126, identifies the more specific destination https://pendo-static-6197323200987136.storage.googleapis.com and chrome.exe. Please investigate the exact destination and the block reason in Defender, and confirm whether it is approved Mediaocean/Pendo content or a genuine threat. Please avoid allowing all of storage.googleapis.com on the basis of this report.

Attach the screenshot and defender-storage-blocks.csv if available. Include your device name and the time of your own occurrence.

## Identify whether the extension contributes

1. Note the exact time when the warning appears.
2. In Chrome DevTools on Prisma, open Network, enable Preserve log, and filter for storage.googleapis.com. Reload and repeat the action that produced the warning. Inspect the matching request's Initiator tab/column. A chrome-extension URL identifies extension code; a website script can identify the site's integration. A block can happen before Chrome records a useful request.
3. For a comparison, temporarily turn Ops Toolshed off at chrome://extensions, reload Prisma, and repeat the same action. Turn it back on and reload Prisma afterwards. If the warning also occurs while disabled, it does not require Ops Toolshed. A single warning-free run is inconclusive.
4. Share only the relevant URL/initiator and screenshot internally. A full HAR can contain private campaign data and credentials; avoid sending one unless IT requests and handles it appropriately.

Windows already keeps the relevant block log. collect-defender-storage-blocks.ps1 exports only matching block times, destination origins and process names. It changes no security settings. If Windows denies log access, IT can run it from an elevated PowerShell window, or inspect Microsoft-Windows-Windows Defender/Operational event 1126 directly.

Do not use Unblock or disable security protection as a workaround. Continue only with unaffected Prisma functions while IT investigates. No extension change has been made to suppress the warning.

Microsoft reference: https://learn.microsoft.com/defender-endpoint/network-protection
