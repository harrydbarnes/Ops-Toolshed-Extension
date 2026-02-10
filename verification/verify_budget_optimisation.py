from playwright.sync_api import sync_playwright, expect
import os
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Construct absolute path to the HTML file
    file_path = os.path.abspath("verification/mock_campaign.html")
    print(f"Loading: file://{file_path}")

    page.goto(f"file://{file_path}")

    # Wait for the script to run and modifications to happen
    try:
        page.wait_for_selector("#optimised-budget-styles", state="attached", timeout=5000)
        print("Success: Style tag injected.")
    except Exception as e:
        print("Error: Style tag not found within timeout.")
        page.screenshot(path="verification/error_screenshot.png")
        raise e

    # 1. Verify Large Screen Logic (Variables on Container)
    # The new logic sets --dynamic-buy-total on #campaign-budget-overview-container

    container = page.locator("#campaign-budget-overview-container")
    expect(container).to_be_visible()

    # Check style attribute for --dynamic-buy-total
    # Expected: "£85,000 / £85,000" (based on mock data "£85,000.00")
    style_attr = container.get_attribute("style")
    print(f"Container Style attribute: {style_attr}")

    if '--dynamic-buy-total' in style_attr and '£85,000 / £85,000' in style_attr:
        print("Success: --dynamic-buy-total set correctly on container")
    else:
        print("Failure: --dynamic-buy-total not set correctly on container")

    # 2. Verify Small Screen Logic (Variables on Value)
    # Switch to small screen first so it becomes visible
    page.set_viewport_size({"width": 1000, "height": 800})
    # Wait a bit for layout
    page.wait_for_timeout(500)

    width = page.evaluate("window.innerWidth")
    print(f"Viewport width: {width}")

    budget_value = page.locator('[data-cy="total-budget"]')

    # Debug info
    # print injected CSS
    css_content = page.locator("#optimised-budget-styles").inner_text()
    # print(f"Injected CSS: {css_content}")

    print(f"Is visible? {budget_value.is_visible()}")
    # box = budget_value.bounding_box()
    # print(f"Bounding box: {box}")

    # Check style attribute for --rounded-budget
    # Expected: "£60k" logic (value is 60000 -> 60)
    # Note: Logic is still based on the budget value element text "£60,000.00"
    style_attr_value = budget_value.get_attribute("style")
    print(f"Value Style attribute: {style_attr_value}")

    if '--rounded-budget' in style_attr_value and '£60' in style_attr_value:
        print("Success: --rounded-budget set correctly on value")
    else:
        print("Failure: --rounded-budget not set correctly on value")

    # Take screenshot of both large and small screens

    # 1. Large Screen (Merged View)
    page.set_viewport_size({"width": 1400, "height": 800})
    page.screenshot(path="verification/budget_optimisation_large_v2.png")
    print("Screenshot taken: budget_optimisation_large_v2.png")

    # 2. Small Screen (Compact View)
    page.set_viewport_size({"width": 1000, "height": 800})
    page.screenshot(path="verification/budget_optimisation_small_v2.png")
    print("Screenshot taken: budget_optimisation_small_v2.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
