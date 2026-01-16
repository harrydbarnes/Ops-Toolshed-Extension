const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load the script content to inject into JSDOM
const placementCounterScript = fs.readFileSync(path.resolve(__dirname, '../../features/placement-counter.js'), 'utf8');

describe('Placement Counter Feature', () => {
    let window, document;

    beforeEach(() => {
        // Setup JSDOM with necessary globals
        const dom = new JSDOM('<!DOCTYPE html><html><body><div id="grid-container_hot"></div></body></html>', {
            runScripts: "dangerously",
            resources: "usable"
        });
        window = dom.window;
        document = window.document;

        // Mock Chrome API
        window.chrome = {
            runtime: { id: 'test-extension-id', lastError: null },
            storage: {
                sync: {
                    get: jest.fn((key, cb) => cb({ countPlacementsSelectedEnabled: true }))
                }
            }
        };

        // Inject the script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = placementCounterScript;
        document.body.appendChild(scriptEl);
    });

    // Helper to create a mock row
    function createRow(id, name, isChecked = true, classes = []) {
        const tr = document.createElement('tr');
        if (classes.length) tr.classList.add(...classes);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'mo-row-checkbox';
        checkbox.dataset.row = id;
        checkbox.checked = isChecked;
        tr.appendChild(checkbox);

        const nameSpan = document.createElement('span');
        nameSpan.id = `placementName-${id}`;
        nameSpan.textContent = name;
        tr.appendChild(nameSpan);

        return tr;
    }

    test('should count valid placement rows', () => {
        jest.useFakeTimers();
        const container = document.getElementById('grid-container_hot');
        container.appendChild(createRow('1', 'Standard Placement'));
        container.appendChild(createRow('2', 'Another Placement'));

        // Trigger the check manually
        window.placementCounterFeature.checkSelection();

        // Fast-forward timers to bypass debounce
        jest.advanceTimersByTime(200);

        const toast = document.querySelector('.placement-toast');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toBe('2 Placements Selected');
        jest.useRealTimers();
    });

    test('should exclude rows with "display" or "media total" in the name', () => {
        jest.useFakeTimers();
        const container = document.getElementById('grid-container_hot');
        container.appendChild(createRow('1', 'Valid Placement'));
        container.appendChild(createRow('2', 'Programmatic Display Package')); // Should be excluded
        container.appendChild(createRow('3', 'Media Total Row')); // Should be excluded

        window.placementCounterFeature.checkSelection();

        jest.advanceTimersByTime(200);

        const toast = document.querySelector('.placement-toast');
        expect(toast.textContent).toBe('1 Placement Selected');
        jest.useRealTimers();
    });

    test('should exclude hierarchical level 0 rows', () => {
        jest.useFakeTimers();
        const container = document.getElementById('grid-container_hot');
        // Add class 'hierarchical-level-0' to simulate a header row.
        // The implementation uses row.querySelector('.hierarchical-level-0'), so it must be a descendant.
        const row = createRow('1', 'Header Row', true);
        const indicator = document.createElement('span');
        indicator.className = 'hierarchical-level-0';
        row.appendChild(indicator);
        container.appendChild(row);

        window.placementCounterFeature.checkSelection();

        jest.advanceTimersByTime(200);

        const toast = document.querySelector('.placement-toast');
        // Should be null or hidden if count is 0
        if(toast) {
             expect(toast.classList.contains('show')).toBe(false);
        } else {
             expect(toast).toBeNull();
        }
        jest.useRealTimers();
    });
});
