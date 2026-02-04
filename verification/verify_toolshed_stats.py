from playwright.sync_api import sync_playwright
import os
import json

def verify_stats(page):
    repo_root = os.getcwd()
    file_path = f"file://{repo_root}/toolshed.html"

    # Mock Data
    mock_storage = {
        "legacyStats": {
            "placementsAdded": 100,
            "totalLoadingTime": 1000,
            "visitedCampaigns": []
        },
        "dailyStats": {
            "2023-10-27": { "placements": 5, "loadingTime": 50, "visitedCampaigns": ["c1"] },
            "2023-10-26": { "placements": 10, "loadingTime": 100 },
            "2023-10-20": { "placements": 8, "loadingTime": 80 }
        },
        "statsStartDate": "2023-01-01T00:00:00.000Z"
    }

    # Expected Totals:
    # Placements: 100 + 5 + 10 + 8 = 123
    # Time: 1000 + 50 + 100 + 80 = 1230
    # Kettles: 1230 / 180 = 6.83 -> 6

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
    assert "123" in placements

    # Loading Time: 1230s = 20m 30s
    loading_time = page.locator("#loading-time-stat").inner_text()
    print(f"Loading Time found: {loading_time}")
    assert "20 min and 30s" in loading_time or "20m 30s" in loading_time

    # 2. Check Kettle Index
    kettles = page.locator("#kettle-index").inner_text()
    print(f"Kettle text: {kettles}")
    assert "6" in kettles

    # 3. Check Heatmap
    heatmap = page.locator("#heatmap")
    assert heatmap.is_visible()
    days = heatmap.locator(".heatmap-day")
    count = days.count()
    print(f"Heatmap days: {count}")
    assert count > 300

    # 4. Check Beat Your Week
    beat_week = page.locator("#beat-your-week").inner_text()
    print(f"Beat Your Week: {beat_week}")
    assert "88%" in beat_week

    # 5. Check "Stats since..." text (restored feature)
    stats_header = page.locator(".stats-header h2")
    header_text = stats_header.inner_text()
    print(f"Header Text: {header_text}")
    assert "since January 1, 2023" in header_text

    # Screenshot
    os.makedirs("verification", exist_ok=True)
    screenshot_path = os.path.join("verification", "toolshed_stats_verified_refactored.png")
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
