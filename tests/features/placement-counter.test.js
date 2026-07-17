const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load the script content to inject into JSDOM
const placementCounterScript = fs.readFileSync(path.resolve(__dirname, '../../features/placement-counter.js'), 'utf8');

describe('Placement Counter Feature', () => {
    let dom, window, document;

    beforeEach(() => {
        jest.useFakeTimers();
        // Setup JSDOM with necessary globals
        dom = new JSDOM('<!DOCTYPE html><html><body><div id="grid-container_hot"></div></body></html>', {
            runScripts: "dangerously"
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

    afterEach(() => {
        dom?.window.close();
        jest.useRealTimers();
    });

    // Helper to create a mock row
    function createRow(id, name, isChecked = true, classes = [], hierarchyLevel = null) {
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

        if (hierarchyLevel !== null) {
            const indicator = document.createElement('span');
            indicator.className = `hierarchical-level-${hierarchyLevel}`;
            tr.appendChild(indicator);
        }

        return tr;
    }

    test('should count valid placement rows', () => {
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
    });

    test('should exclude rows with "display" or "media total" in the name', () => {
        const container = document.getElementById('grid-container_hot');
        container.appendChild(createRow('1', 'Valid Placement'));
        container.appendChild(createRow('2', 'Programmatic Display Package')); // Should be excluded
        container.appendChild(createRow('3', 'Media Total Row')); // Should be excluded

        window.placementCounterFeature.checkSelection();

        jest.advanceTimersByTime(200);

        const toast = document.querySelector('.placement-toast');
        expect(toast.textContent).toBe('1 Placement Selected');
    });

    test('should exclude hierarchical level 0 rows', () => {
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
    });

    test('groups a selected Programmatic package with its selected placements', () => {
        const container = document.getElementById('grid-container_hot');
        // Programmatic packages use a different icon, so the hierarchy is the reliable signal.
        container.appendChild(createRow('1', 'Programmatic package', true, [], 1));
        container.appendChild(createRow('2', 'Programmatic placement one', true, [], 2));
        container.appendChild(createRow('3', 'Programmatic placement two', true, [], 2));

        window.placementCounterFeature.checkSelection();

        jest.advanceTimersByTime(200);

        expect(document.querySelector('.placement-toast').textContent)
            .toBe('1 Package Selected (w/2 Placements)');
    });

    test('groups a selected box-icon package with its selected placements', () => {
        const container = document.getElementById('grid-container_hot');
        container.appendChild(createRow('1', 'DV360 package', true, ['mi-package'], 1));
        container.appendChild(createRow('2', 'DV360 placement one', true, [], 2));
        container.appendChild(createRow('3', 'DV360 placement two', true, [], 2));

        window.placementCounterFeature.checkSelection();

        jest.advanceTimersByTime(200);

        expect(document.querySelector('.placement-toast').textContent)
            .toBe('1 Package Selected (w/2 Placements)');
    });
});
