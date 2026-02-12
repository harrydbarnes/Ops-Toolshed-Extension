from playwright.sync_api import sync_playwright, expect
import os
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Construct absolute path to the HTML file
    file_path = os.path.abspath("verification/mock_campaign.html")
    print(f"Loading: file://{file_path}")

    # TestCase 1: Success (Entry Point Exists)
    print("\n--- TestCase 1: Entry Point Exists ---")
    page.goto(f"file://{file_path}")

    # Wait for the script to run
    try:
        page.wait_for_selector("#optimised-budget-styles", state="attached", timeout=5000)
    except:
        print("Error: Style tag not found.")

    # Check for active class
    container = page.locator("#campaign-budget-overview-container")
    import re
    expect(container).to_have_class(re.compile(r"dynamic-budget-active"))
    print("Success: dynamic-budget-active class present.")

    # Check variable
    style_attr = container.get_attribute("style")
    if '--dynamic-buy-total' in style_attr:
        print("Success: --dynamic-buy-total set.")
    else:
        print("Failure: --dynamic-buy-total NOT set.")

    if '--dynamic-budget-only' in style_attr:
        print("Success: --dynamic-budget-only set.")
    else:
        print("Failure: --dynamic-budget-only NOT set.")

    # Check Small Screen View
    print("\n--- Checking Small Screen View ---")
    page.set_viewport_size({"width": 1000, "height": 800})
    page.wait_for_timeout(500)

    budget_value = page.locator('[data-cy="total-budget"]')
    # Check if content is using the full format
    # We can't easily check pseudo-element content with Playwright directly without evaluate
    content = budget_value.evaluate("el => window.getComputedStyle(el, '::before').content")
    print(f"Small Screen Content (Expect '£85,000'): {content}")

    # Mock data sets amount to £85,000.00 -> Stripped to £85,000
    if "85,000" in content and "k" not in content:
        print("Success: Small screen showing full format.")
    else:
        print(f"Failure: Small screen content is '{content}'.")

    page.screenshot(path="verification/budget_opt_small_full.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
