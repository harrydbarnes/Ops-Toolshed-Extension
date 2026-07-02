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

        page.wait_for_selector(toast_selector, state="visible", timeout=WAIT_FOR_SELECTOR_TIMEOUT_MS)
        print("Toast appeared!")

        # Wait a bit for the animation to settle
        page.wait_for_timeout(WAIT_FOR_ANIMATION_TIMEOUT_MS)

        # Verify content
        content = page.text_content(toast_selector)
        print("Toast content verified")
        assert content and "Did you know?" in content, "Toast is missing its heading"

        # Verify alignment with the Shadow DOM spinner.
        spinner_box = page.locator('#spinner-container .spinner').bounding_box()
        assert spinner_box, "Spinner box was not found"
        toast_box = page.locator(toast_selector).bounding_box()
        assert toast_box, "Toast box was not found"

        spinner_center = spinner_box['x'] + spinner_box['width'] / 2
        toast_center = toast_box['x'] + toast_box['width'] / 2
        assert abs(spinner_center - toast_center) < 2, "Toast is not centered on the spinner"

        assert toast_box['y'] > 300, "Toast is not positioned near the bottom of the viewport"

        # Removing the spinner must remove the toast, including across async checks.
        page.evaluate("document.querySelector('#spinner-container').remove()")
        page.wait_for_selector(toast_selector, state="detached", timeout=WAIT_FOR_SELECTOR_TIMEOUT_MS)

        browser.close()

if __name__ == "__main__":
    test_loading_facts()
