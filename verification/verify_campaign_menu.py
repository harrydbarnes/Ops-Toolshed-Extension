from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the verification HTML file
        file_path = f"file://{os.getcwd()}/verification/verify_campaign_menu.html"
        print(f"Loading: {file_path}")
        page.goto(file_path)

        # Wait for the status to update
        try:
            page.wait_for_selector("#status:has-text('Success')", timeout=5000)
            print("Status updated to Success.")
        except Exception as e:
            print(f"Error waiting for status: {e}")

        # Verify Click Logic (URL Change)
        # We need to simulate the click and check if navigation would occur
        # In the HTML test, we can't easily assert navigation without leaving the page.
        # But we can check if the listener is attached and logic is sound by inspecting attributes.

        # Let's perform a click and see if it tries to navigate.
        # Since it's a file:// URL, appending params works locally.

        current_url = page.url
        print(f"Current URL: {current_url}")

        # Click the first icon wrapper
        new_toolbar = page.locator('#mo-extracted-actions-toolbar')
        first_icon = new_toolbar.locator('div').first
        first_icon.click()

        # Wait a bit for "navigation"
        page.wait_for_timeout(500)

        new_url = page.url
        print(f"New URL: {new_url}")

        if "&osModalId=prsm-cm-cmpdtls" in new_url:
             print("URL Navigation Logic Verified: Parameter appended.")
        else:
             print("URL Navigation Logic FAILED: Parameter not appended.")

        # Take a screenshot
        screenshot_path = "verification/campaign_menu_verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
