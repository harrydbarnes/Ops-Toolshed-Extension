# Ops Toolshed Chrome Extension 🛠️

**Current version: 1.4**

Ops Toolshed is a Chrome extension that streamlines day-to-day campaign management in Prisma and provides quick access to common Operations tools.

## What's new in 1.4

- Copy clean Order IDs from Campaign Order pages without the version suffix.
- Choose a compact campaign navigation style that moves campaign links into the header, including direct Orders navigation.
- Keep the booked budget visible in the campaign header with a responsive layout for smaller screens.
- See rotating facts while Prisma is loading, including a summary of time spent waiting.
- Track campaigns visited, loading time, placements added, and reconciliations in the redesigned Stats dashboard, with an activity heatmap, weekly comparisons, and streaks.
- Make the AppLearn logo translucent so it does not obstruct the interface, including when it is rendered inside Shadow DOM.
- Keep Campaign Details, Copy, and History actions beside the campaign name.
- Keep the approver widget available in Actualise without covering the campaign header or native controls.
- Submit feedback from the popup, Settings, Approvers, or Toolshed pages.
- Use refreshed Approver data with retired approvers removed.

## Features

### Quick navigation and launch tools

- Open Prisma, Aura timesheets and approvals, handbooks, SharePoint resources, and other frequently used Operations links from the popup.
- Open a campaign's **Actualize** route using its Campaign ID and month/year.
- Find and open a campaign from its D number.
- Switch quickly between NGM locations in Prisma.
- Launch the Meta Billing Check on the Meta Ads Manager campaigns page to export campaign names, dates, impressions, budgets, and spend as CSV.

### Prisma workflow enhancements

All optional enhancements can be controlled from **Settings**.

| Feature | What it does |
| --- | --- |
| Campaign navigation | Offers optimised campaign navigation, direct Orders access, responsive booked-budget information, and Campaign Details, Copy, and History actions beside the campaign name. |
| Order ID Copy | Adds a button that copies an Order ID without its version suffix. |
| Auto Copy Campaign URL | Copies the campaign URL when Prisma's link-copy control is used. |
| Add Campaign automation | Opens the full-details flow, hides unused sections, and can select Digital media mix and Total Cost budget type automatically. |
| Placement Counter | Shows the number of selected placements in the Prisma grid. |
| Approver Widget Optimise | Improves the approval widget layout, keeps it available in Actualise, and provides fast approver entry. |
| See Comments on Locked Buys | Makes comments accessible when a Buy is locked. |
| GMI Chat and Live Chat tools | Adds a GMI Chat shortcut plus smaller-font, resizable-window, and scheduled-launch options for Live Chat. |
| Switch Accounts | Adds a shortcut for changing account context. |
| Replace Prisma Logo | Uses the Ops Toolshed icon to show that the extension is active. |
| Translucent AppLearn Logo | Reduces obstruction from the AppLearn overlay, including Shadow DOM variants. |
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
- Placements added
- Reconciliations
- Activity heatmap, weekly productivity, streak, and comparison metrics

Stats collection can be disabled or reset at any time. Feedback can be submitted from the extension's main pages through the built-in feedback form.

## Settings

Open the extension options page to configure UI and reminder themes, campaign navigation style, individual Prisma enhancements, chat tools, reminders, stats collection, loading facts, and custom reminders. Settings are stored through Chrome extension storage.

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
