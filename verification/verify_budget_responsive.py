from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        file_path = f"file://{os.getcwd()}/verification/verify_budget_responsive.html"
        page.goto(file_path)
        page.wait_for_timeout(1000)

        # Force display block just in case
        page.eval_on_selector('.campaign-budget-overview-value', 'el => el.style.display = "inline-flex"')

        # Large Screen
        page.set_viewport_size({"width": 1300, "height": 800})
        before_content = page.eval_on_selector(
            '.campaign-budget-overview-value',
            "el => window.getComputedStyle(el, '::before').content"
        )
        print(f"Large Screen ::before content: {before_content}")

        # Check font size
        font_size = page.eval_on_selector('.campaign-budget-overview-value', 'el => window.getComputedStyle(el).fontSize')
        print(f"Large Screen font size: {font_size}")

        if '"£29,999.99 / "' in before_content: # Quote matching can be tricky
             print("Large Screen Logic: PASS")
        else:
             print("Large Screen Logic: FAIL")

        # Small Screen
        page.set_viewport_size({"width": 1000, "height": 800})
        after_content = page.eval_on_selector(
            '.campaign-budget-overview-value',
            "el => window.getComputedStyle(el, '::after').content"
        )
        print(f"Small Screen ::after content: {after_content}")

        font_size_small = page.eval_on_selector('.campaign-budget-overview-value', 'el => window.getComputedStyle(el).fontSize')
        print(f"Small Screen font size: {font_size_small}")

        if '"£60k"' in after_content:
             print("Small Screen Logic: PASS")
        else:
             print("Small Screen Logic: FAIL")

        browser.close()

if __name__ == "__main__":
    run()
