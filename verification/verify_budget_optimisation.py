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
    expect(container).to_have_class(re.compile(r"dynamic-budget-active")) # Expect active class
    print("Success: dynamic-budget-active class present.")

    # Check variable
    style_attr = container.get_attribute("style")
    if '--dynamic-buy-total' in style_attr:
        print("Success: --dynamic-buy-total set.")
    else:
        print("Failure: --dynamic-buy-total NOT set.")

    # Check visual state of original label (should be hidden/modified)
    # The CSS makes font-size 0 for .dynamic-budget-active .cbjS...
    # We can check computed font size of the label.
    label = page.locator(".cbjS\\+XIoeuDmb-oqpXOJpw\\=\\=").nth(1) # Budget label
    font_size = label.evaluate("el => window.getComputedStyle(el).fontSize")
    print(f"Label Font Size (Expect 0px): {font_size}")

    page.set_viewport_size({"width": 1400, "height": 800})
    page.screenshot(path="verification/budget_opt_success.png")


    # TestCase 2: Failure/Fallback (Entry Point Missing)
    print("\n--- TestCase 2: Entry Point Missing ---")
    # Reload page but remove the entry point immediately before script runs?
    # Or just modify the HTML file?
    # Easiest is to modify the DOM via page.evaluate right after navigation but before script runs?
    # Hard because script runs immediately.
    # Better: Create a temporary HTML file without the entry point.

    with open("verification/mock_campaign.html", "r") as f:
        content = f.read()

    # Remove the entry point div
    content_fallback = content.replace('<div data-cy="media-budget-overview-container-media_digital"', '<!-- removed --> <div data-ignore="true"')

    with open("verification/mock_campaign_fallback.html", "w") as f:
        f.write(content_fallback)

    file_path_fallback = os.path.abspath("verification/mock_campaign_fallback.html")
    page.goto(f"file://{file_path_fallback}")

    # Wait for script (wait for style tag again as proxy)
    try:
        page.wait_for_selector("#optimised-budget-styles", state="attached", timeout=5000)
    except:
        pass

    # Check for active class (Should be MISSING)
    container = page.locator("#campaign-budget-overview-container")
    classes = container.get_attribute("class") or ""
    print(f"Classes found: '{classes}'")

    if "dynamic-budget-active" not in classes:
        print("Success: dynamic-budget-active class MISSING.")
    else:
        print("Failure: dynamic-budget-active class PRESENT (Unexpected).")

    # Check visibility of original budget
    # Label should NOT have font-size 0
    label = page.locator(".cbjS\\+XIoeuDmb-oqpXOJpw\\=\\=").nth(1)
    font_size = label.evaluate("el => window.getComputedStyle(el).fontSize")
    print(f"Label Font Size (Expect > 0px, e.g. 16px): {font_size}")

    # Value should be visible (not display: none)
    value = page.locator('[data-cy="total-budget"]')
    # Note: On small screens (<=1200px), it might be modified by the other media query,
    # but on large screens (1400px viewport), it should be visible if optimization is NOT active.
    # Wait, the small screen query is: @media (max-width: 1200px).
    # The large screen query is: @media (min-width: 1201px).
    # Our viewport for this check is inherited from previous step? No, we didn't set it for Test 2.
    # Default viewport is 1280x720.
    # Let's set it to 1400 explicitly for the large screen check.

    page.set_viewport_size({"width": 1400, "height": 800})

    display = value.evaluate("el => window.getComputedStyle(el).display")
    print(f"Value Display (Expect not 'none'): {display}")

    page.screenshot(path="verification/budget_opt_fallback.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
