from playwright.sync_api import sync_playwright
import os
import json

def verify_stats(page):
    repo_root = os.getcwd()
    file_path = f"file://{repo_root}/toolshed.html"

    # Mock Data
    # 2023-10-27 is Today in the mock
    mock_storage = {
        "legacyStats": {
            "placementsAdded": 100,
            "totalLoadingTime": 1000,
            "visitedCampaigns": []
        },
        "dailyStats": {
            "2023-10-27": { "placements": 5, "loadingTime": 50, "visitedCampaigns": ["c1"] },
            "2023-10-26": { "placements": 10, "loadingTime": 100 },
            "2023-10-25": { "placements": 10, "loadingTime": 100 },
            "2023-10-24": { "placements": 10, "loadingTime": 100 },
            "2023-10-20": { "placements": 8, "loadingTime": 80 }
        },
        "statsStartDate": "2023-01-01T00:00:00.000Z"
    }

    # Streak Logic Check:
    # 27th (Fri) - Active (5)
    # 26th (Thu) - Active (10)
    # 25th (Wed) - Active (10)
    # 24th (Tue) - Active (10)
    # 23rd (Mon) - No Data (0) -> Break? Yes, Mon is not bank holiday in Oct 2023?
    # Wait, 23 Oct 2023 is Monday. Not a bank holiday.
    # So streak is 4 days: 27, 26, 25, 24.

    page.add_init_script("""
        window.chrome = {
            storage: {
                local: {
                    get: (keys, callback) => {
                        const data = %s;
                        if (callback) callback(data);
                        return Promise.resolve(data);
                    },
                    set: () => Promise.resolve()
                },
                onChanged: {
                    addListener: () => {}
                }
            },
            runtime: {
                getURL: (path) => path
            }
        };

        const OriginalDate = Date;
        // Mock Today as Friday, Oct 27 2023
        const FIXED_DATE = new OriginalDate('2023-10-27T12:00:00');
        window.Date = class extends OriginalDate {
            constructor(...args) {
                if (args.length) return new OriginalDate(...args);
                return new OriginalDate(FIXED_DATE);
            }
            static now() {
                return FIXED_DATE.getTime();
            }
        };
    """ % json.dumps(mock_storage))

    print(f"Loading {file_path}")
    page.goto(file_path)

    # Click Stats Tab
    print("Clicking Stats tab...")
    page.click('button[data-tab="stats"]')

    page.wait_for_selector("#placements-added-stat", state="visible")
    page.wait_for_timeout(500)

    # 1. Check Totals
    placements = page.locator("#placements-added-stat").inner_text()
    print(f"Placements found: {placements}")

    # 2. Check Streak
    streak_text = page.locator("#streak-counter").inner_text()
    print(f"Streak found: {streak_text}")
    assert "4 Day Streak" in streak_text

    # 3. Check Heatmap Tooltip
    # Hover over the last day (Today)
    days = page.locator(".heatmap-day")
    last_day = days.last
    last_day.hover()

    tooltip = page.locator("#heatmap-tooltip")
    assert tooltip.is_visible()
    tooltip_text = tooltip.inner_text()
    print(f"Tooltip Text: {tooltip_text}")
    # Format should be dd.mm.yy
    # 27.10.23
    assert "27.10.23" in tooltip_text

    # Screenshot
    os.makedirs("verification", exist_ok=True)
    screenshot_path = os.path.join("verification", "toolshed_stats_refactored_verified.png")
    page.screenshot(path=screenshot_path)
    print(f"Screenshot saved to {screenshot_path}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_stats(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            exit(1)
        finally:
            browser.close()
