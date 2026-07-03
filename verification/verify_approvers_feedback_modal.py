from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    url = "http://localhost:8000/approvers.html"
    print(f"Loading {url}")

    # Mock chrome API
    page.add_init_script("""
        window.chrome = {
            storage: {
                local: {
                    get: (keys, cb) => {
                        if (typeof cb === 'function') cb({});
                        return Promise.resolve({});
                    },
                    set: (data, cb) => {
                        if (typeof cb === 'function') cb();
                        return Promise.resolve();
                    }
                },
                onChanged: {
                    addListener: () => {}
                }
            },
            runtime: {
                getManifest: () => ({ version: '1.4' }),
                getURL: (path) => path
            }
        };
    """)

    page.goto(url)

    # Click the feedback link
    print("Clicking feedback link...")
    page.click('#menu-feedback-btn')

    # Wait for modal to appear
    print("Waiting for modal...")
    page.wait_for_selector('#ops-toolshed-feedback-root', timeout=5000)
    print("Modal successfully appeared!")

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification/approvers_feedback_modal.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
