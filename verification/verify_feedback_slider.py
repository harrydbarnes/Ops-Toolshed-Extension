from playwright.sync_api import sync_playwright
import os
import time

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
    
    # Fill in required fields to enable next step
    page.select_option('#otf-section', 'General/Other')
    page.select_option('#otf-type', 'Feedback')
    page.fill('#otf-tip', 'This is a test feedback.')
    page.fill('#otf-ideaBy', 'Test User')
    page.fill('#otf-name', 'Tester')
    
    # Click Next
    page.click('#otf-next-btn')
    
    # Wait for animation
    time.sleep(0.5)
    
    # Screenshot Step 2 (Slider effect verification)
    page.screenshot(path="verification/feedback_slider_step2.png")
    
    # Submit to see toast
    # Mock window.location.href or ignore navigation
    page.evaluate("window.open = () => {}") # Just in case
    
    page.click('#otf-next-btn') # Now it says Submit
    
    # Wait for toast
    page.wait_for_selector('.otf-toast.visible')
    
    # Screenshot Toast
    page.screenshot(path="verification/feedback_toast.png")
    
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
