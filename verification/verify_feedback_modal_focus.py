from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    
    cwd = os.getcwd()
    url = f"file://{cwd}/toolshed.html"
    
    # Mock chrome API
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
    
    page.click('#open-feedback-modal')
    page.wait_for_selector('#ops-toolshed-feedback-root')
    
    # Focus the text area
    page.focus('#otf-tip')
    
    # Take screenshot of the focused element area
    page.screenshot(path="verification/feedback_modal_focus.png")
    
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
