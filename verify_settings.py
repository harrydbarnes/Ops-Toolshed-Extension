from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

    # Mock chrome.storage
    page.add_init_script("""
        window.chrome = {
            runtime: {
                id: 'mock-id',
                lastError: null,
                onMessage: { addListener: () => {} },
                sendMessage: (msg, cb) => { if(cb) cb(); }
            },
            storage: {
                sync: {
                    get: (keys, callback) => {
                        // Mock data
                        const data = {
                            alwaysShowCommentsEnabled: true,
                            logoReplaceEnabled: true,
                            customReminders: [],
                            prismaReminderFrequency: 'daily',
                            prismaCountdownDuration: '5',
                            metaReminderEnabled: true,
                            iasReminderEnabled: true,
                            fontSizeToggleEnabled: false,
                            resizableChatToggleEnabled: false,
                            scheduledChatToggleEnabled: false,
                            addCampaignShortcutEnabled: false,
                            hidingSectionsEnabled: false,
                            automateFormFieldsEnabled: false,
                            countPlacementsSelectedEnabled: false,
                            approverWidgetOptimiseEnabled: false,
                            swapAccountsEnabled: false,
                            timesheetReminderEnabled: false,
                            reminderDay: 'Friday',
                            reminderTime: '14:30'
                        };

                        // Handle object with defaults
                        if (typeof keys === 'object' && !Array.isArray(keys) && keys !== null) {
                             let res = {};
                             for (let k in keys) {
                                 res[k] = data[k] !== undefined ? data[k] : keys[k];
                             }
                             callback(res);
                             return;
                        }

                        if (typeof keys === 'string') {
                            callback({[keys]: data[keys]});
                        } else if (Array.isArray(keys)) {
                             let res = {};
                             keys.forEach(k => res[k] = data[k]);
                             callback(res);
                        } else {
                            callback(data);
                        }
                    },
                    set: (items, callback) => {
                        if(callback) callback();
                    }
                },
                local: {
                    get: (keys, callback) => {
                        callback({timeBombActive: false});
                    },
                    remove: (keys, cb) => { if(cb) cb(); }
                }
            },
            tabs: {
                query: (q, cb) => cb([])
            }
        };
    """)

    # Load settings.html
    cwd = os.getcwd()
    page.goto(f"file://{cwd}/settings.html")

    # Wait for content to load
    page.wait_for_selector('h1:has-text("Settings")')

    # Check if build info is loaded
    build_info = page.evaluate("window.buildInfo")
    print(f"window.buildInfo: {build_info}")

    # Check for "Always Show Comments" toggle
    page.wait_for_selector('text=See Comments on Locked Buys')

    # Check for the new ID
    page.wait_for_selector('#seeCommentsOnLockedBuysToggle', state='attached')

    # Check for Build Info div text
    # We use state='attached' first, then check visibility or content
    page.wait_for_selector('#build-info')

    content = page.text_content('#build-info')
    print(f"Build info div content: '{content}'")

    if not content:
        print("Build info content is empty!")

    # Take screenshot
    output_dir = 'verification'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    page.screenshot(path=os.path.join(output_dir, 'verification.png'), full_page=True)
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
