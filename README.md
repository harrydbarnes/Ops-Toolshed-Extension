# Ops Toolshed Chrome Extension 🛠️

**Feature set as of version: 1.3**

A utility extension built to enhance Prisma functionality and provide quick access to various operations and tools, streamlining daily workflows for campaign management and approvals.

## Key Features 🔑

The Ops Toolshed extension is divided into several categories of features:

* **Quick Navigation:** One-click access to critical external and internal platforms (e.g., Prisma, Aura Timesheets, Handbooks).
* **Workflow Efficiency:** Automated form filling, UI improvements, and tools within Prisma's Campaign Management interface.
* **Contextual Reminders:** Automated reminders for critical steps in reconciliation and booking processes.
* **Approver Management Tool:** A dedicated search interface for finding, filtering, and managing Prisma approver email addresses.
* **Communication Enhancements:** Tools to improve chat and account switching experiences.
* **Utility Tools:** Quick launch tools for deep-linking into Prisma campaigns by ID or D-number, and a bulk data scraper for Meta Ads Manager.

---

## Detailed Feature Breakdown 📋

### 1. Quick Navigation & Launch Tools 🚀

All of these features are available directly from the extension's popup menu:

* **One-Click Navigation:** Direct links to key applications like:
    * Prisma
    * Prisma Approvers (New dedicated tool)
    * My Timesheets (Aura)
    * Timesheet Approvals (Aura)
    * Meta Handbook
    * Ops D.R.E
    * TPO Sharepoint
    * Prisma Approvers List
    * Add Campaign
    * Meta Billing Check (Launches scraper for Meta Ads Manager - **currently WIP**)
* **Campaign URL Generator (Open Campaign):** Quickly generates a direct link to the **Actualize** route within a Prisma campaign for a specified **Campaign ID** and month/year.
* **D Number Campaign Opener:** Automatically navigates to the Prisma Campaigns dashboard and uses a script to search for and open a campaign based on its **D Number**.
* **Prisma Location Switcher:** Provides quick buttons to switch between different New Global Media (NGM) locations (NGMCLON, NGMCINT, NGMCSCO, NGOPEN) within Prisma.

### 2. Prisma Workflow Enhancements ⚡

These features activate when viewing the Prisma web app and can be managed via the **Settings** page:

| Setting Name | Functionality |
| :--- | :--- |
| **Replace Prisma Logo** | Replaces the standard Prisma logo with the extension's custom icon in the UI, indicating the extension is active. |
| **'Add Campaign' auto clicks 'Enter Full Details'** | Automatically redirects a campaign creation URL to bypass the simplified 'light-box' option, defaulting to the full details page. |
| **Hide unused sections on 'Add Campaign'** | Hides the **Objective**, **Targeting**, and **Flighting** sections on the 'Add Campaign' page for a cleaner interface. |
| **Automate 'Budget type' and 'Media mix' selection** | Automatically sets the 'Media Mix' field to **Digital** (`media_digital`) and 'Budget Type' to **Total Cost** (`3`) on the 'Add Campaign' form. |
| **Always Show Comments** | Fixes the "Buy" button issue in Campaign Management by automatically removing interfering UI elements when the button is locked. |
| **Placement Counter** | Automatically counts and displays the number of selected placements in the Prisma grid. |

### 3. Contextual Reminders 🔔

The extension monitors page content and URLs in real-time to display critical, non-dismissable popups:

* **Meta Reconciliation Reminder:** Shows a reminder popup on the Prisma 'actualize' page when specific text conditions for Meta reconciliation are detected (`000770` and `Redistribute all`).
* **IAS Booking Reminder:** Shows a reminder popup when specific conditions for IAS booking are detected (`001148`, `Flat`, and `Unit Type`).
* **Custom Reminders:** Allows users to create their own custom reminders triggered by a **URL pattern** (supporting wildcards `*`) and optional **page text trigger**.
* **Timesheet Reminder (Aura):** A recurring notification alarm that can be configured to trigger on a specific **Day** and **Time** (e.g., Friday at 14:30), with a snooze option.

### 4. Approver Management Tools 👥

A dedicated tool set for handling Prisma approver emails:

* **Prisma Approver Search Page:** A separate HTML page (`approvers.html`) providing a searchable, filterable list of all approvers. Users can filter by **Business Unit**, **Client/Office Name**, and a **Favourites Only** toggle.
* **Approve/Copy Integration:** Users can select multiple approvers, copy their emails to the clipboard, and save them as favourites directly from the search tool.
* **One-Click Paste in Prisma:** On Prisma approval pages, buttons are injected next to the 'To' field to:
    * **Paste Approvers:** Automatically pastes a semi-colon delimited list of emails from the clipboard into the Prisma search field, selecting and adding each one sequentially.
    * **Paste Favourites:** Automatically pastes all saved favourite approver emails.

### 5. Communication & Account Tools 💬

* **GMI Chat Button:** Adds a quick-access button to the interface for launching the GMI Chat tool.
* **Live Chat Enhancements:** Improvements to the live chat interface for better usability.
* **Swap Accounts:** A utility to quickly switch between different user accounts or contexts within the application.

### 6. Meta Billing Check Utility 📊

* **Meta Billing Check:** A button in the extension popup that, when clicked on the **Meta Ads Manager campaigns page**, injects a script to scrape and download campaign data (including Campaign Name, Start/End Dates, Impressions, Budget, and Amount Spent) as a CSV file.

---

## Settings ⚙️

All optional and automated features can be toggled on/off and configured in the dedicated **Settings** page (`settings.html`). This page also hosts the interface for **creating, editing, and exporting Custom Reminders**.
