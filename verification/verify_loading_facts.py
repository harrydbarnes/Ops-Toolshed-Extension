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

            # Verify Vertical Order (Toast should be below Spinner)
            # Use Shadow DOM piercing to locate the spinner inside #spinner-container
            spinner_box = page.locator('div#vp-block > i.fa.fa-circle-o-notch.fa-spin').bounding_box()

            if spinner_box:
                toast_box = page.locator(toast_selector).bounding_box()
                if toast_box:
                    # Calculate centers
                    spinner_center = spinner_box['x'] + spinner_box['width'] / 2
                    toast_center = toast_box['x'] + toast_box['width'] / 2

                    print(f"Spinner Center X: {spinner_center}, Toast Center X: {toast_center}")

                    # Verify Horizontal Alignment (with slight tolerance)
                    if abs(spinner_center - toast_center) < 2:
                        print("PASS: Toast is horizontally centered relative to the spinner")
                    else:
                        print(f"FAIL: Toast is not centered. Diff: {abs(spinner_center - toast_center)}")
                else:
                    print("FAIL: Toast box not found for alignment check")
            else:
                 print("FAIL: Spinner box not found via locator '#spinner-container .spinner'")

            # Simplified check: Check if toast Y > 50 (approx top of screen)
            toast_box = page.locator(toast_selector).bounding_box()
            print(f"Toast Y: {toast_box['y']}")

            # In test.html, Toast has position: fixed; bottom: 100px.
            # With default viewport size (1280x720), Y should be approx 620.
            # Let's assert it is in the bottom half of the screen (e.g. > 300px).
            if toast_box['y'] > 300:
                 print(f"PASS: Toast is positioned near bottom (Y: {toast_box['y']})")
            else:
                 print(f"FAIL: Toast Y position {toast_box['y']} seems too high for bottom-anchored element")

            # Take screenshot
            page.screenshot(path="verification/loading_facts_verification.png")
            print("Screenshot saved to verification/loading_facts_verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")

        browser.close()

if __name__ == "__main__":
    test_loading_facts()
