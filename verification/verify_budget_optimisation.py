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

    # 1. Verify Large Screen Logic (Variables on Label)
    # The label is the last element with class .cbjS+XIoeuDmb-oqpXOJpw==
    # We need to escape correctly or use a simpler selector if possible.
    # Since we added data-cy to value, let's look for label relative to it or by text?
    # The text inside label is "Budget".

    budget_label = page.locator(".cbjS\\+XIoeuDmb-oqpXOJpw\\=\\=").nth(1) # Second label (Billable is first)
    expect(budget_label).to_be_visible()

    # Check style attribute for --budget-large-text
    # Expected: "£50,000 / £60,000" (removed decimals)
    style_attr_label = budget_label.get_attribute("style")
    print(f"Label Style attribute: {style_attr_label}")

    if '--budget-large-text' in style_attr_label and '£50,000 / £60,000' in style_attr_label:
        print("Success: --budget-large-text set correctly on label")
    else:
        print("Failure: --budget-large-text not set correctly on label")

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
    print(f"Injected CSS: {css_content}")

    print(f"Is visible? {budget_value.is_visible()}")
    box = budget_value.bounding_box()
    print(f"Bounding box: {box}")
    computed_style = budget_value.evaluate("el => window.getComputedStyle(el).display")
    print(f"Computed display: {computed_style}")
    computed_font = budget_value.evaluate("el => window.getComputedStyle(el).fontSize")
    print(f"Computed font-size: {computed_font}")

    # If font-size is 0, playwright might consider it hidden if dimensions are 0
    # But ::before should give it size.

    # Check style attribute for --rounded-budget
    # Expected: "£60" (60000 / 1000)
    style_attr_value = budget_value.get_attribute("style")
    print(f"Value Style attribute: {style_attr_value}")

    if '--rounded-budget' in style_attr_value and '£60' in style_attr_value:
        print("Success: --rounded-budget set correctly on value")
    else:
        print("Failure: --rounded-budget not set correctly on value")

    # Take screenshot of both large and small screens

    # 1. Large Screen (Merged View)
    page.set_viewport_size({"width": 1400, "height": 800})
    # Force layout recalc?
    page.evaluate("document.body.offsetHeight")
    page.screenshot(path="verification/budget_optimisation_large.png")
    print("Screenshot taken: budget_optimisation_large.png")

    # 2. Small Screen (Compact View)
    page.set_viewport_size({"width": 1000, "height": 800})
    page.screenshot(path="verification/budget_optimisation_small.png")
    print("Screenshot taken: budget_optimisation_small.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
