from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    
    cwd = os.getcwd()
    url = f"file://{cwd}/settings.html"
    
    # Mock chrome API
    page.add_init_script("""
        window.chrome = {
            storage: {
                sync: {
                    get: (keys, cb) => cb({}),
                    set: (data, cb) => cb && cb()
                },
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
                getURL: (path) => path,
                onMessage: {
                    addListener: () => {}
                }
            },
            tabs: {
                query: (q, cb) => cb([])
            }
        };
    """)
    
    page.goto(url)
    page.click('#open-feedback-modal')
    
    # Wait for modal to verify it opens
    page.wait_for_selector('#ops-toolshed-feedback-root')
    
    # Take screenshot
    page.screenshot(path="verification/settings_feedback.png")
    
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
