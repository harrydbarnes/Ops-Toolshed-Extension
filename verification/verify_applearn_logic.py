
from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mock window.utils
    page.evaluate("""
        window.utils = {
            queryShadowDom: (selector) => document.querySelector(selector)
        };
    """)

    # Mock chrome.storage
    page.evaluate("""
        window.chrome = {
            storage: {
                sync: {
                    get: (defaults, callback) => {
                        console.log('chrome.storage.sync.get called');
                        callback({ appLearnReplaceEnabled: true });
                    }
                },
                onChanged: {
                    addListener: (callback) => {
                        console.log('chrome.storage.onChanged listener added');
                        window.testOnChangedListener = callback;
                    }
                }
            }
        };
    """)

    # Read the feature file
    with open('features/applearn-replace.js', 'r') as f:
        feature_code = f.read()

    # Inject the feature code
    try:
        page.evaluate(feature_code)
        print("Feature code injected successfully.")
    except Exception as e:
        print(f"Error injecting feature code: {e}")

    # Check if window.appLearnFeature is defined
    is_defined = page.evaluate("typeof window.appLearnFeature !== 'undefined'")
    if is_defined:
        print("window.appLearnFeature is defined.")
    else:
        print("ERROR: window.appLearnFeature is NOT defined.")

    # Check if listener was registered
    listener_registered = page.evaluate("typeof window.testOnChangedListener === 'function'")
    if listener_registered:
        print("chrome.storage.onChanged listener registered.")
    else:
        print("ERROR: chrome.storage.onChanged listener NOT registered.")

    # Test initialize (should trigger get and applyTransparency)
    # We can spy on injectStyles via the mock if we wanted, but let's just check console logs or simple execution
    page.evaluate("window.appLearnFeature.initialize()")

    # Verify initialize behavior by checking if applyTransparency logic ran (e.g. injectStyles)
    # Since we didn't mock injectStyles inside the object (it's part of the object we injected),
    # we can check if the style tag was added.

    style_exists = page.evaluate("!!document.getElementById('toolshed-applearn-styles')")
    if style_exists:
        print("initialize() successfully injected styles.")
    else:
        print("ERROR: initialize() failed to inject styles.")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
