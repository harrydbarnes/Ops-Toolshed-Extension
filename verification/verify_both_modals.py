from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mocks
    page.add_init_script("""
        window.chrome = {
            storage: {
                local: { get: (k, cb) => cb({}), set: (d, cb) => cb && cb() },
                sync: { get: (k, cb) => cb({}), set: (d, cb) => cb && cb() },
                onChanged: { addListener: () => {} }
            },
            runtime: { getManifest: () => ({ version: '1.4' }), getURL: (path) => path }
        };
    """)

    # 1. Verify Approvers
    page.goto("http://localhost:8000/approvers.html")
    page.click('#menu-feedback-btn')
    page.wait_for_selector('#ops-toolshed-feedback-root')
    page.screenshot(path="verification/approvers_modal_fixed.png")

    # 2. Verify Settings
    page.goto("http://localhost:8000/settings.html")
    page.click('#open-feedback-modal')
    page.wait_for_selector('#ops-toolshed-feedback-root')
    page.screenshot(path="verification/settings_modal_fixed.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
