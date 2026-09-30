# Ops Toolshed Chrome Extension 🛠️

**Current version: 1.9** • Built for Media Operations & Planning teams

Ops Toolshed is a Google Chrome extension that supercharges Mediaocean Prisma and streamlines day-to-day campaign workflows. It automates repetitive tasks, adds one-click navigation and exports, flags budget and product code issues, provides quick access to approvers and standard operating procedures, and centralises agency tools.

## What's new in 1.9
Read the [in-extension release notes](toolshed.html) for the current changes and roadmap. That page is the maintained version history.

Use **Check Meta** in a Prisma campaign to check its current bookings in an overlay, or **Live campaign checks** in Social Booking Checker to check visited campaigns and manage monitors. No exported reports are needed. Choose **Meta access** to save or replace your token directly, without uploading reports. A check does not enrol a campaign in monitoring: choose **Monitor this campaign** separately for checks every 30 minutes while Chrome is running. Results show budget and date differences, available Meta spend outside booking dates, and changes since the last successful check. Monitored campaigns show a header indicator when something needs review. Missing links, shared booking coverage, currency differences and unavailable historical data are shown for review rather than treated as a complete match.

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
- **How is client data handled?**
  Campaign data can be read from Prisma, stored in Chrome for features such as History and approval tracking, and sent to Mediaocean when a feature checks a campaign. The Social Booking Checker can send a saved Meta access token to Meta Graph API when you refresh Meta data. Review [Data, permissions and privacy](docs/data-and-permissions.md) before using client data.

---

## 🧭 Getting Started & First Steps

- **First-Run Setup:** Choose whether you book on Prisma. Prisma bookers can set preferences and take the guided Prisma tour. Everyone else gets a short setup for shared tools and reminders, without the Prisma tour. Change your choice later in Settings.
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
Settings lets Prisma bookers choose their campaign, Orders, Actualise, approver, navigation and help enhancements individually. The [complete feature catalogue](docs/feature-catalogue.md) is generated from the same registry used by Settings and the in-extension feature explorer; it is the reference for feature names, descriptions and defaults.

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
- **Diagnostics Mode:** Advanced Settings can temporarily record local feature timings, lifecycle outcomes, coarse Prisma page area, and the current campaign ID when one is present. The local records can be exported or cleared, and collection turns off after 24 hours or when Chrome restarts. Treat both the stored records and an exported file as sensitive.

---

## 🔒 Privacy & Data Security

- **Storage:** Feature preferences, the onboarding role and reminder settings use `chrome.storage.sync`, which may sync through the user's Chrome profile. Campaign history, approval records, uploaded reports, the Meta token, stats and diagnostics use local extension storage. See the [data inventory](docs/data-and-permissions.md) for retention and clearing controls.
- **Network access:** Prisma features communicate with Mediaocean; Social Booking Checker can call Meta Graph API with a user-provided token; Help Guides open company SharePoint. Some extension pages may load stylesheet/font assets from public CDNs. The extension does not include a separate analytics service.
- **Sensitive exports:** Campaign History, diagnostics and Social Booking exports can contain client or campaign information. Review the file and use approved company channels before sharing it.

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
