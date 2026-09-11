# Ops Toolshed Chrome Extension 🛠️

**Current version: 1.9** • Built for Media Operations & Planning teams

Ops Toolshed is a Google Chrome extension that supercharges Mediaocean Prisma and streamlines day-to-day campaign workflows. It automates repetitive tasks, adds one-click navigation and exports, flags budget and product code issues, provides quick access to approvers and standard operating procedures, and centralises agency tools.

## What's new in 1.9
- **Campaign Approval Tracking:** Monitors submitted campaigns in the background every 5 minutes, notifies users with an in-page toast alert when marked as Approved, displays an `x/y Campaign Approved` status notice with dropdown list next to Switch Accounts, and enables one-click navigation to open approved campaigns in a new tab.
- **Campaign History:** Adds global search for visited campaigns by name, client, CP number, CL/PR/CA reference, or supplier with local logging and paginated browsing.
- **Moe media auto-select:** When Moe asks for a media, automatically selects the current campaign media and sends the first prompt when the matching option is available. The behaviour can be disabled under Settings → Features → Live Chat.

---

## 🚀 How to Install (Quick 2-Minute Setup)

Because Ops Toolshed is an internal tool, it is installed directly into Google Chrome using **Developer mode**.

### Step 1: Download & Extract the Files
1. Download the latest release ZIP (e.g. from your team's SharePoint, Teams channel, or GitHub releases).
2. Extract the ZIP into a **permanent folder** on your computer. 
   - **Recommended location:** Inside your **Documents** folder, create a new folder called **Chrome Extensions** (for example: `Documents\Chrome Extensions\Ops-Toolshed`).
   > ⚠️ **Important:** Do not leave the files in your temporary `Downloads` folder or delete/move the folder after installing. Chrome runs the extension directly from this location whenever you use the browser.

### Step 2: Open Chrome Extensions
1. Open Google Chrome.
2. Type or paste the following into your address bar and press **Enter**:
   ```text
   chrome://extensions
   ```
   *(Alternatively: Click the Chrome **three-dots menu (⋮)** in the top-right corner > **Extensions** > **Manage Extensions**).*

### Step 3: Enable Developer Mode
1. In the top-right corner of the Extensions page, turn on the **Developer mode** toggle switch.

### Step 4: Load the Extension
1. Click the **Load unpacked** button in the top-left corner.
2. Browse to and select your extracted `Ops-Toolshed` folder (select the folder that contains `manifest.json`).
3. You will immediately see **Ops Toolshed** appear in your list of active extensions!

### Step 5: Pin the Extension for Easy Access
By default, newly loaded extensions may be hidden inside Chrome's menus. To make it easily accessible:
1. Click the **Extensions** menu icon (the puzzle piece 🧩) to the right of your address bar.
   - *If you don't see the puzzle piece icon, click Chrome's **three-dots menu (⋮)** in the top-right corner and hover over **Extensions**.*
2. In the dropdown list, find **Ops Toolshed 🛠️**.
3. Click the **Pin** icon (📌) next to it so it stays pinned to your Chrome toolbar for one-click access.

---

### 🔄 How to Update to a New Version
When an update is released:
1. Download the new version and replace the files inside your existing `Documents\Chrome Extensions\Ops-Toolshed` folder.
2. Go back to `chrome://extensions` in Chrome.
3. Find **Ops Toolshed** and click the **Reload** button (🔄 circular arrow).

---

### ❓ Troubleshooting & FAQs
- **"Manifest file is missing or unreadable" error?**
  When clicking *Load unpacked*, ensure you select the specific folder that directly contains `manifest.json`, rather than a nested outer or unzipped wrapper folder.
- **Is this safe to use with client data?**
  Yes. Ops Toolshed executes entirely within your local browser. No passwords, client names, campaign budgets, or user tracking data are ever transmitted to third-party or external servers.

---

## 🧭 Getting Started & First Steps

- **First-Run Tour:** The first time you open Prisma with Ops Toolshed active, a brief onboarding walkthrough will highlight key features and let you choose your preferred defaults.
- **Customising Features:** Click the Ops Toolshed toolbar icon and select **Settings** (or right-click the icon and choose **Options**) to enable or disable individual features at any time.
- **Help Guides:** Inside Prisma, look for the floating launcher in the bottom-right corner to search standard operating procedures (SOPs), read SharePoint documentation, and view guided walkthroughs.

---

## ✨ Key Features Breakdown

### 🚀 Quick Navigation & Launch Tools
- **Ops Hub:** Launch Prisma, Aura timesheets and approvals, SharePoint handbooks, and operations tools directly from the popup.
- **Campaign Jump:** Open any campaign directly by entering its **Campaign ID** or **D-Number**.
- **Actualise Direct:** Jump straight to a campaign's Actualise grid for a specific month and year.
- **Social Booking Checker:** Cross-reference Meta campaign exports against Prisma booking reports with PO match suggestions, variance analysis, and Excel exports.

### ⚡ Prisma Workflow Enhancements
All enhancements can be independently toggled in **Settings**:

| Feature | What it does |
| --- | --- |
| **Campaign Navigation** | Adds optimised navigation tabs, direct Orders & Actualise buttons, campaign-name click-to-copy, and edit shortcuts. |
| **Max Campaign Budget** | One-click button to fill editable Buy Cost or Actualise Gross payable cells to match the remaining budget. |
| **Actualise Bulk Export** | Download and combine every visible month's Actualise view into a single, clean Excel-ready CSV in one click. |
| **Actualise Month Guard** | Shows a green *Correct Month* badge or detects mismatches (*Check Month*) and auto-refreshes to the right grid. |
| **Campaign History** | Search visited campaigns by name, client, CP number, CL/PR/CA code, or supplier with local logging. |
| **Product Code Warning** | Flags product and campaign suffix limits in active headers and provides EasyVista planner reminders. |
| **DST Assurance** | Displays DST Booked badges and verifies Meta 2% Location Fees for compliant booking setups. |
| **Order ID Copy** | One-click button to copy Order IDs without version suffixes from the Orders sidebar or summary. |
| **Approver Workflow** | Quick approver search, favourite approvers, batch email copying, and submission email tracking. |
| **Approval Tracking** | Monitors submitted campaigns in the background every 5 minutes and notifies you via toast and banner when marked Approved. |
| **Placement Counter** | Displays the real-time count of selected placements in the Prisma grid. |
| **Auto Copy Campaign URL** | Copies clean, shareable campaign links with a single click. |
| **Add Campaign Automation** | Opens full details automatically, selects Digital media mix, and hides unused sections. |
| **See Comments on Locked Buys** | Keeps comments and notes accessible even when a Buy is locked. |
| **Plan-to-Buy Direct** | Automatically navigates directly to the Buy workspace when clicking campaign links. |
| **Prisma Username Label** | Displays your signed-in username in the top banner so active account context is always clear. |
| **AppLearn Cleanup** | Makes the AppLearn logo translucent and closes non-functional login popups. |
| **Loading Facts** | Displays rotating media industry facts, tips, and wait-time statistics during page loads. |

*...and so much more!*

### 👥 Approver Management
- Search and filter approved signers by Business Unit or Client/Office.
- Save favourite approvers and copy multiple addresses formatted for Prisma paste fields.
- Directly paste clipboard or favourite approvers into approval flows.
- Reference a maintained list with retired approvers removed.

### ⏰ Reminders & Timers
- Built-in Meta reconciliation and IAS booking alerts.
- Scheduled Aura timesheet submission reminders with snooze support.
- Custom keyword- and URL-triggered reminders to keep important steps top-of-mind.

### 📊 Stats & Activity Insights
View your personal productivity metrics in the **Release Notes, Roadmap + Stats** tab:
- Total campaigns visited and placement counts.
- Time spent waiting for Prisma to load across Home, Plan, Buy, Actualise, and Orders.
- Activity heatmaps, streaks, and popups blocked.
- *Note: Stats are stored 100% locally on your machine and can be disabled or reset at any time.*
- **Diagnostics Mode:** Advanced Settings can temporarily record local feature timings, lifecycle outcomes, coarse Prisma page area, and the current campaign ID when one is present. It stays local, can be exported or cleared, and turns off after 24 hours or when Chrome restarts; campaign IDs are included only in the user-exported file, so share it appropriately.

---

## 🔒 Privacy & Data Security

- **Local Storage:** All preferences, reminders, campaign history, and stats are saved exclusively in your Chrome browser's local storage (`chrome.storage.local`).
- **No Third-Party Tracking:** The extension communicates only with required internal work domains (`mediaocean.com`, `sharepoint.com`, and optional local Meta Graph API calls if you use the Social Booking Checker).
- **Your Data Stays Yours:** No campaign names, financial figures, client data, or credentials are ever sent to external analytics or third-party servers.

---

## 💬 Feedback & Support

Have an idea for a new feature, a question, or ran into a bug?
- Open the extension popup or Settings and click **Send Feedback**.
- Or submit an issue directly via the [GitHub Issues tracker](https://github.com/harrydbarnes/EMC-Toolshed-Extension/issues).

---

## 💻 For Developers & Contributors

For code conventions, testing suites, and agent protocol, please see [AGENTS.md](AGENTS.md).

```bash
# Install dependencies
npm install

# Run syntax checks & test suites
npm run check:syntax
npm test

# Update build date & commit before saving changes:
npm run update-build
git add build-info.js
```
