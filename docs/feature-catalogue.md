# Feature catalogue

Generated from `feature-settings-registry.js`. Edit that registry, then run `npm run docs:features`. Settings and the in-extension feature explorer use the same records. The in-extension release notes in `toolshed.html` remain the owner of version history.

The non-Prisma setup profile does not inject Prisma features. Shared popup tools, Settings, Approvers and timesheet reminders remain available.

## Personalise and reminders

| Feature | What it does | Default |
| --- | --- | --- |
| Popup UI theme | Choose the pink or black presentation used by the extension popup. | Choice or action |
| Replace Prisma Logo | Swaps the standard Prisma mark for the selected Toolshed logo treatment. | On |
| Translucent AppLearn Logo | Makes the AppLearn logo less visually dominant while keeping it recognisable. | On |
| Meta finance tool | Selects whether the popup opens Booking Checker or the legacy Billing Check workflow. | Choice or action |
| Loading Facts | Shows a useful fact while Prisma is processing an Actualise action. | On |
| Stats Collector | Records waiting-time and productivity signals for the local Toolshed statistics view. | On |
| Diagnostics Mode | Temporarily records local feature timings, outcomes and the current campaign ID when available; clear or export records in Settings. | Off |
| Meta reconciliation reminder | Show the checks needed before reconciling Meta bookings. | On |
| IAS booking reminder | Show the IAS setup reminder on matching Prisma pages. | On |
| Timesheet reminder | Choose the day and time for your weekly Aura timesheet notification. | On |
| Custom reminders | Create your own reminders for matching pages, with the message and timing you need. | Choice or action |
| Loading Facts library | Browse, rate and choose the facts that appear while Prisma is working. | Choice or action |
| Stats, release notes and roadmap | Review your local productivity statistics, see what changed and explore planned improvements. | Choice or action |

## Navigation

| Feature | What it does | Default |
| --- | --- | --- |
| Prisma banner username | Shows the signed-in Mediaocean username in the Prisma banner. | On |
| Campaign tab title | Uses the active campaign name as the browser tab title. | On |
| Open Plan campaign links in Buy | Opens Buy when a campaign Plan URL is loaded directly. Clicking Prisma’s Plan tab still opens Plan. | On |
| Prisma sign-in assistant | On a focused Prisma sign-in tab only, fills your saved email, remembers the browser, and selects your organisation. | Off |
| Campaign History search | Adds a History link to Prisma campaign navigation and lets you search campaigns you have visited. | On |
| Log campaigns visited | Records campaign names, references, supplier details and active account locations locally so they can be found later in Campaign History. | On |
| Orders shortcut | Adds an Orders shortcut to the campaign navigation menu. | On |
| Actualise shortcut | Adds a shortcut that opens the current Actualise month directly. | On |
| Actualise navigation bar | Keeps Prisma’s main Plan, Buy, Traffic, Analyse and Orders navigation visible in Actualise. | On |
| Switch Accounts | Adds a faster account-switch action where it is useful in Prisma. | On |
| Restore page after account switch | Returns you to the Prisma page you were viewing after a new account has loaded. | On |
| Popup tools and campaign launchers | Open campaigns by reference, choose an account location, and reach Prisma, Meta Handbook, timesheets, approvals, myOffice Days, TPO Sharepoint, the approvers list, Add Campaign, Social Booking Checker and Ops Guide from the extension popup. | Choice or action |

## Campaign creation and details

| Feature | What it does | Default |
| --- | --- | --- |
| Quick campaign actions | Adds quick details, copy campaign and history actions to campaign pages. | On |
| Campaign name copy | Adds a one-click copy action for the campaign name. | On |
| Campaign header copy | Adds copy actions for the campaign ID and CL, PR and CA references. | On |
| Campaign dates shortcut | Adds a direct shortcut for editing campaign dates. | On |
| Auto Copy Campaign URL | Copies the current campaign URL when you open a campaign. | On |
| URL format | Choose a short shareable campaign URL or the full address. | Choice or action |
| Add Campaign shortcut | Automatically opens Enter Full Details after choosing Add Campaign. | On |
| Hide unused Add Campaign sections | Reduces visual noise by hiding sections that are not needed when adding a campaign. | On |
| Automate form fields | Preselects the Budget type and Media mix fields during campaign creation. | On |

## Orders and Actualise

| Feature | What it does | Default |
| --- | --- | --- |
| Count Placements Selected | Displays the number of selected placement rows beside Prisma’s selection tools. | On |
| Actualise bulk export | Exports each visible Actualise month and combines the results into one CSV-ready file. | On |
| Order ID copy | Lets you click an Order ID in the new Orders sidebar to copy it. | On |
| Actualise month assurance | Confirms that the Actualise URL, selected month, rendered grid and native response all agree. | On |
| New Order UI | Applies the extension’s layout improvements to Prisma’s newer Orders interface. | On |
| Comments on locked Buys | Keeps comments visible when a Buy is locked. | On |
| Actualise scroll restoration | Restores the active grid’s horizontal position after an Actualise save refresh. | On |
| Order Summary alignment | Keeps Order Summary headers aligned with the scrolling grid. | On |

## Help and live chat

| Feature | What it does | Default |
| --- | --- | --- |
| Help Guides launcher | Adds a draggable launcher that opens searchable Prisma help guides. | On |
| GMI Chat shortcut | Adds a direct shortcut to the GMI chat workflow. | On |
| Smaller Chat Font | Uses a more compact font size in the live chat window. | On |
| Resizable Chat Window | Lets you resize the live chat window to suit the task. | On |
| Auto-select Moe media | Selects the campaign media in Moe and sends the first prompt when a matching option is available. | On |
| Block AppLearn popups | Closes the broken blank AppLearn login popups without affecting normal exports. | On |
