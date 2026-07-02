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

        # Wait for content to load
        page.wait_for_selector(".container", state="visible")

        toggle_selector = "#loadingFactsToggle"
        assert page.locator(toggle_selector).count() == 1, "Loading Facts toggle was not found"

        assert page.is_checked(toggle_selector), "Loading Facts toggle should default to enabled"

        page.evaluate("document.querySelector('#loadingFactsToggle').click()")
        assert not page.is_checked(toggle_selector), "Loading Facts toggle did not respond to input"

        browser.close()

if __name__ == "__main__":
    test_settings_toggle()
