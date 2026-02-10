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
    # We can check for the injected style tag
    try:
        page.wait_for_selector("#optimised-budget-styles", state="attached", timeout=5000)
        print("Success: Style tag injected.")
    except Exception as e:
        print("Error: Style tag not found within timeout.")
        page.screenshot(path="verification/error_screenshot.png")
        raise e

    # Check for CSS variables on the budget element
    # The budget element is the last one with the class xb1phb+xdUqb87KZK3L+Sw==
    # We need to escape special characters for CSS selector if using them directly,
    # but Playwright handles this via internal locators usually.
    # Let's use get_by_text since we know the content

    budget_value = page.locator("span.xb1phb\\+xdUqb87KZK3L\\+Sw\\=\\=").nth(1) # Second one is budget

    # Verify the element exists
    expect(budget_value).to_be_visible()

    # Check the style attribute for the CSS variables
    # We can evaluate JS to get the computed style or just check the inline style attribute
    # The script sets property on style object, so it should be in 'style' attribute.

    style_attr = budget_value.get_attribute("style")
    print(f"Style attribute: {style_attr}")

    if '--rounded-budget' in style_attr and '£60k' in style_attr:
        print("Success: --rounded-budget set correctly to £60k")
    else:
        print("Failure: --rounded-budget not set correctly")

    if '--billable-prepend' in style_attr and '£50,000.00' in style_attr:
         print("Success: --billable-prepend set correctly")
    else:
         print("Failure: --billable-prepend not set correctly")

    # Take screenshot of both large and small screens

    # 1. Large Screen (Merged View)
    page.set_viewport_size({"width": 1400, "height": 800})
    page.screenshot(path="verification/budget_optimisation_large.png")
    print("Screenshot taken: budget_optimisation_large.png")

    # 2. Small Screen (Compact View)
    page.set_viewport_size({"width": 1000, "height": 800})
    page.screenshot(path="verification/budget_optimisation_small.png")
    print("Screenshot taken: budget_optimisation_small.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
