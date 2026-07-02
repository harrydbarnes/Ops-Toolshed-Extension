from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the verification HTML file
        file_path = f"file://{os.getcwd()}/verification/verify_gmi_width.html"
        print(f"Loading: {file_path}")
        page.goto(file_path)

        # Wait for the status to update
        try:
            # Wait for text "Success" or "Failure" in #status
            page.wait_for_selector("#status:has-text('Success')", timeout=5000)
            print("Status updated to Success.")
        except Exception as e:
            print(f"Error waiting for status: {e}")

        # Take a screenshot
        screenshot_path = "verification/gmi_width_verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
