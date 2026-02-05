from playwright.sync_api import sync_playwright
import os

WAIT_FOR_SELECTOR_TIMEOUT_MS = 5000
WAIT_FOR_ANIMATION_TIMEOUT_MS = 1000

def test_loading_facts():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get absolute path to the test file
        test_file_path = os.path.abspath("verification/test.html")
        page.goto(f"file://{test_file_path}")

        # Wait for the toast to appear
        toast_selector = ".loading-fact-toast"

        try:
            page.wait_for_selector(toast_selector, state="visible", timeout=WAIT_FOR_SELECTOR_TIMEOUT_MS)
            print("Toast appeared!")

            # Wait a bit for the animation to settle
            page.wait_for_timeout(WAIT_FOR_ANIMATION_TIMEOUT_MS)

            # Verify content
            content = page.text_content(toast_selector)
            print(f"Toast content: {content}")

            if "Did you know?" in content:
                print("Toast contains 'Did you know?'")
            else:
                print("FAIL: Toast missing header")

            # Take screenshot
            page.screenshot(path="verification/loading_facts_verification.png")
            print("Screenshot saved to verification/loading_facts_verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    test_loading_facts()
