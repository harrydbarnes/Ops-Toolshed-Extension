from playwright.sync_api import sync_playwright
import os

def test_settings_toggle():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Add init script to mock chrome.storage.sync
        page.add_init_script("""
            window.chrome = {
                storage: {
                    sync: {
                        get: (key, callback) => {
                            // Default to true for loadingFactsEnabled if not specified
                            const data = {};
                            if (typeof key === 'string') {
                                data[key] = true;
                            } else if (Array.isArray(key)) {
                                key.forEach(k => data[k] = true);
                            }
                            callback(data);
                        },
                        set: (data, callback) => {
                            console.log('Storage set:', data);
                            if (callback) callback();
                        }
                    },
                    local: {
                        get: (key, callback) => callback({}) // Mock timeBombActive check
                    }
                },
                runtime: {
                    onMessage: {
                        addListener: () => {}
                    },
                    lastError: null
                }
            };
        """)

        # Get absolute path to settings.html
        settings_path = os.path.abspath("settings.html")
        page.goto(f"file://{settings_path}")

        try:
            # Wait for content to load
            page.wait_for_selector(".container", state="visible")

            # Check for the toggle
            toggle_selector = "#loadingFactsToggle"
            if page.locator(toggle_selector).count() > 0:
                print("Loading Facts toggle found!")

                # Check if checked (mocked to true)
                is_checked = page.is_checked(toggle_selector)
                print(f"Toggle initial state checked: {is_checked}")

                if is_checked:
                    print("PASS: Toggle defaults to enabled")
                else:
                    print("FAIL: Toggle not enabled by default")

                # Scroll to the element to ensure it's in the screenshot
                page.locator(toggle_selector).scroll_into_view_if_needed()

            else:
                print("FAIL: Loading Facts toggle not found")

            # Take screenshot
            page.screenshot(path="verification/settings_toggle.png")
            print("Screenshot saved to verification/settings_toggle.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/settings_error.png")

        browser.close()

if __name__ == "__main__":
    test_settings_toggle()
