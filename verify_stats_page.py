import asyncio
import http.server
import json
import os
import shutil
import socketserver
import tempfile
import threading
from playwright.async_api import async_playwright

async def main():
    # Create a temporary directory to host the extension files
    temp_dir = tempfile.mkdtemp()
    print(f"Created temporary directory: {temp_dir}")

    try:
        # Copy necessary files to the temp directory
        files_to_copy = [
            'toolshed.html', 'toolshed.js', 'toolshed.css', 'style.css'
        ]
        for file in files_to_copy:
            shutil.copy(file, os.path.join(temp_dir, file))

        # Start a local HTTP server in a separate thread
        os.chdir(temp_dir)
        PORT = 8001
        Handler = http.server.SimpleHTTPRequestHandler
        httpd = socketserver.TCPServer(("", PORT), Handler)

        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()

        print(f"Serving at port {PORT}")
        await asyncio.sleep(1) # Give the server a moment to start

        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            # Mock chrome.storage.local.get
            mock_data = {
                "prismaUserStats": {
                    "visitedCampaigns": ["1", "2", "3"],
                    "totalLoadingTime": 12.3456,
                    "placementsAdded": 5
                },
                "statsStartDate": "2023-01-01T12:00:00.000Z",
                "visitTimestamps": [
                    "2023-01-01T12:00:00.000Z",
                    "2023-01-02T12:00:00.000Z",
                    "2023-01-02T18:00:00.000Z",
                    "2023-01-03T12:00:00.000Z"
                ]
            }

            await page.add_init_script(f"""
                window.chrome = {{
                    storage: {{
                        local: {{
                            get: (keys, callback) => {{
                                callback({json.dumps(mock_data)});
                            }}
                        }},
                        onChanged: {{
                            addListener: () => {{}}
                        }}
                    }},
                    runtime: {{
                        onMessage: {{
                            addListener: () => {{}}
                        }}
                    }}
                }};
            """)

            await page.goto(f"http://localhost:{PORT}/toolshed.html")

            # Click the stats tab
            await page.click('button[data-tab="stats"]')

            # Wait for the stats to be displayed
            await page.wait_for_selector('#campaigns-visited-stat:not(:empty)')

            await page.screenshot(path="verification.png")
            print("Screenshot taken and saved as verification.png")

            await browser.close()

        httpd.shutdown()

    finally:
        # Clean up the temporary directory
        shutil.rmtree(temp_dir)
        print(f"Removed temporary directory: {temp_dir}")

if __name__ == "__main__":
    asyncio.run(main())
