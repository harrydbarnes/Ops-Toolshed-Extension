from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the verification HTML file
        file_path = f"file://{os.getcwd()}/verification/verify_budget_responsive.html"
        print(f"Loading: {file_path}")
        page.goto(file_path)

        # Wait for JS execution
        try:
            page.wait_for_selector("#status:has-text('Success')", timeout=5000)
            print("DOM Injection Verification: Success")
        except Exception as e:
            print(f"DOM Injection Verification Failed: {e}")

        # Test Responsiveness (CSS)

        # Large Screen
        page.set_viewport_size({"width": 1300, "height": 800})
        # Check expanded visible, compact hidden
        expanded_visible = page.locator('.budget-expanded').is_visible()
        compact_visible = page.locator('.budget-compact').is_visible()
        toolbar_visible = page.locator('#mo-extracted-actions-toolbar').is_visible()

        if expanded_visible and not compact_visible and toolbar_visible:
            print("Large Screen Layout: Correct")
        else:
            print(f"Large Screen Layout Failed: Expanded={expanded_visible}, Compact={compact_visible}, Toolbar={toolbar_visible}")

        # Small Screen
        page.set_viewport_size({"width": 1000, "height": 800})
        # Check expanded hidden, compact visible, toolbar hidden
        expanded_visible = page.locator('.budget-expanded').is_visible()
        compact_visible = page.locator('.budget-compact').is_visible()
        toolbar_visible = page.locator('#mo-extracted-actions-toolbar').is_visible()

        if not expanded_visible and compact_visible and not toolbar_visible:
            print("Small Screen Layout: Correct")
        else:
            print(f"Small Screen Layout Failed: Expanded={expanded_visible}, Compact={compact_visible}, Toolbar={toolbar_visible}")

        # Take a screenshot
        screenshot_path = "verification/budget_responsive_verification.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
