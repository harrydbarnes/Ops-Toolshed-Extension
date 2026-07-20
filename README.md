# Ops Toolshed Chrome Extension 🛠️

**Current version: 1.6**

Ops Toolshed is a Chrome extension that streamlines day-to-day campaign management in Prisma and provides quick access to common Operations tools.

## What's new in 1.6

- Redesigned Custom Reminders with Simple and Advanced URL matching, a site-only shortcut, and an animated editor that keeps the background Settings layout fixed.
- Improved reminder matching on dynamic Prisma pages, with edited rules applied immediately and clearer custom versus built-in popup styling.
- The replacement Prisma logo now applies or restores immediately when its setting changes, without refreshing the page.
- Fixed clipped dropdown text in the Submit Feedback modal when it is opened over Prisma.
- Improved D/O number search and extension message handling so failures return clearer errors instead of silently timing out.
- Added a Social Booking Checker that compares Meta campaign-month activity with Prisma Partner Line IDs, planned values and available schedule dates, then exports an evidence-labelled exception CSV.
- Campaign tabs now keep the campaign name across Prisma routes, campaign-date shortcuts wait for the Basic editor to become ready, and the approver widget returns to its optimised position after Buy/Orders navigation.

## Features

### Quick navigation and launch tools

- Open Prisma, Aura timesheets and approvals, handbooks, SharePoint resources, and other frequently used Operations links from the popup.
- Open a campaign's **Actualize** route using its Campaign ID and month/year.
- Find and open a campaign from its D number.
- Switch quickly between NGM locations in Prisma.
- Open the Social Booking Checker to compare a Meta campaign export against a Prisma booking report. Exact Campaign ID and month evidence drives the result; campaign-name similarity is used only to identify likely unlinked bookings for investigation.

### Prisma workflow enhancements

All optional enhancements can be controlled from **Settings**.

| Feature | What it does |
| --- | --- |
| Campaign navigation | Offers configurable optimised navigation, direct Orders and Actualise tabs, an optional navbar in Actualise, responsive booked-budget information, campaign-name click-to-copy, campaign-name browser tabs, a campaign-date shortcut to the Basic editor, Actualise scroll restoration, and Campaign Details, Copy, and History actions beside the campaign name. |
| Order ID Copy | Adds a button that copies an Order ID without its version suffix. |
| Auto Copy Campaign URL | Copies either Prisma's short campaign link or the full current URL when the link-copy control is used. |
| Add Campaign automation | Opens the full-details flow, hides unused sections, and can select Digital media mix and Total Cost budget type automatically. |
| Placement Counter | Shows the number of selected placements in the Prisma grid. |
| Approver Widget Optimise | Improves the approval widget layout, keeps it available in Actualise, and provides fast approver entry. |
| See Comments on Locked Buys | Makes comments accessible when a Buy is locked. |
| GMI Chat and Live Chat tools | Adds a GMI Chat shortcut plus smaller-font, resizable-window, and scheduled-launch options for Live Chat. |
| Switch Accounts | Adds a shortcut for changing account context. |
| Prisma banner username | Replaces the organisation label with the signed-in Mediaocean username so the active account is immediately visible. |
| Replace Prisma Logo | Uses the Ops Toolshed icon to show that the extension is active. |
| Translucent AppLearn Logo | Reduces obstruction from the AppLearn overlay, including Shadow DOM variants. |
| Block broken AppLearn popups | Closes non-working AppLearn and associated Okta login popups opened from Prisma or Aura. |
| Loading Facts | Displays rotating facts while Prisma loads and can include tracked waiting-time context. |

### Approver tools

- Search and filter approvers by Business Unit or Client/Office Name.
- Save favourite approvers and copy multiple email addresses at once.
- Paste clipboard or favourite approvers directly into Prisma approval pages.
- Use a maintained approver list with retired entries removed.

### Reminders

- Built-in reminders for Meta reconciliation and IAS booking conditions.
- Custom reminders based on URL patterns, one or more page-text triggers, and configurable AND/OR match logic.
- Configurable reminder frequency, dismissal countdown, and colour theme.
- Scheduled Aura timesheet notifications with snooze support.

### Stats and feedback

The **Release Notes, Roadmap + Stats** page records local Prisma activity, including:

- Campaigns visited
- Time spent waiting and average load time
- Waiting time by Prisma area, including Home, Plan, Buy, Actualise, Traffic, Analyse and Orders
- Placements added
- Reconciliations
- Broken AppLearn popups blocked
- Activity heatmap, weekly productivity, streak, and comparison metrics

Stats collection can be disabled or reset at any time. Feedback can be submitted from the extension's main pages through the built-in feedback form.

## Settings

Open the extension options page to configure UI and reminder themes, optimised campaign-navigation features, individual Prisma enhancements, chat tools, reminders, stats collection, loading facts, and custom reminders. Settings are stored through Chrome extension storage.

## Development

This is a Manifest V3 extension.

```bash
npm install
npm test
```

To load it locally, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository.

Before every commit, update and stage the build information shown in the extension UI:

```bash
npm run update-build
git add build-info.js
```
