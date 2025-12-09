# Ops Toolshed Chrome Extension

**Version: 1.2**

A utility extension built to enhance Prisma functionality and provide quick access to various operations and tools, streamlining daily workflows for campaign management and approvals.

## Overview

The Ops Toolshed extension integrates directly with Prisma and Aura platforms to provide:
* **Workflow Automation:** Automates repetitive tasks like form filling and campaign navigation.
* **Contextual Alerts:** Provides reminders for critical processes like Meta reconciliation and IAS booking.
* **Approver Management:** A robust tool for searching, filtering, and pasting approver emails.
* **Quick Navigation:** One-click access to essential internal and external links.

## Project Structure

*   `background.js`: Service worker handling alarms, notifications, and message routing.
*   `content.js`: Main script injected into web pages to handle DOM interactions and logic.
*   `popup.js`: Logic for the extension's popup interface.
*   `settings.js`: Manages user configuration and custom reminders.
*   `approvers.js` & `approvers-data.js`: Logic and data for the Approver Management tool.
*   `offscreen.js`: Handles background tasks requiring DOM access, like clipboard operations and audio playback.

## Key Features

### 1. Quick Navigation & Launch Tools
Available via the extension popup:
*   **Prisma & Aura Links:** Quick access to Prisma, My Timesheets, Approvals, and Handbooks.
*   **Campaign Tools:**
    *   **Open Campaign:** Generates deep links to specific campaigns based on ID and date.
    *   **D-Number Search:** Automates searching and opening campaigns by D-Number.
*   **Location Switcher:** Rapidly switch between NGM locations (NGMCLON, NGMCINT, etc.).

### 2. Prisma Workflow Enhancements
Configurable via Settings:
*   **Logo Replacement:** Replaces the Prisma logo with the extension icon to indicate activity.
*   **Add Campaign Automation:** Auto-redirects to full details view, hides unused sections, and pre-fills 'Media Mix' and 'Budget Type'.

### 3. Contextual Reminders
*   **Built-in Reminders:** Alerts for Meta Reconciliation and IAS Booking based on page content.
*   **Custom Reminders:** User-defined popups triggered by specific URL patterns and page text.
*   **Timesheet Reminder:** Configurable weekly alarm to remind users to submit timesheets.

### 4. Approver Management
*   **Search Interface:** Filter approvers by Business Unit, Client, or Favorites.
*   **One-Click Paste:** Inject buttons into Prisma to auto-paste selected or favorite approver emails.

### 5. Meta Billing Check
*   **Scraper:** Extracts campaign data (Budget, Spend, Impressions) from Meta Ads Manager into a CSV file.

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Load into Chrome:**
    *   Open `chrome://extensions/`
    *   Enable **Developer mode** (top right).
    *   Click **Load unpacked**.
    *   Select the directory containing `manifest.json`.

## Usage

*   **Popup:** Click the extension icon to access navigation links and tools.
*   **Settings:** Right-click the extension icon and select **Options**, or use the gear icon in the popup.
*   **Approvers:** Access the "Prisma Approvers" tool from the popup.
*   **Automation:** Navigate to supported Prisma pages (e.g., Add Campaign) to see automation in action.

## Development

*   **Documentation:** All source files are thoroughly documented with JSDoc.
*   **Testing:** Run tests using `npm test` (if configured).

## License

[License Information Here]
