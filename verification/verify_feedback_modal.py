from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Load toolshed.html
    # We need absolute path
    cwd = os.getcwd()
    url = f"file://{cwd}/toolshed.html"
    print(f"Loading {url}")
    
    # Mock chrome API to avoid errors if referenced
    page.add_init_script("""
        window.chrome = {
            storage: {
                local: {
                    get: (keys, cb) => cb({}),
                    set: (data, cb) => cb && cb()
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
    page.click('#open-feedback-modal')
    
    # Wait for modal to appear
    print("Waiting for modal...")
    page.wait_for_selector('#ops-toolshed-feedback-root')
    
    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification/feedback_modal.png")
    
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
