const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-export-all.js'),
    'utf8'
);

describe('Actualise export every month', () => {
    function createFeature({
        months = ['Jan 26', 'Feb 26', 'Mar 26'],
        activeMonth = 'Feb 26'
    } = {}) {
        const monthItems = months.map(month =>
            `<li class="${month === activeMonth ? 'active' : ''}"><a>${month}</a></li>`
        ).join('');
        const dom = new JSDOM(`<!doctype html><html><head></head><body>
            <div id="mos-paginator"><ul>${monthItems}</ul></div>
            <div id="btn-importExportPlacements-container">
                <button id="btn-importExportPlacements">Import/ Export</button>
                <ul id="import-export-placements">
                    <li id="btn-1"><a>Export placements</a></li>
                    <li id="btn-2"><a>Export actuals view</a></li>
                    <li id="btn-3"><a>Export buys</a></li>
                </ul>
            </div>
        </body></html>`, {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP37TC2&ptb-ctx=actualize&route=actualize&mos=2026-02-01'
        });

        const exports = [];
        const monthLinks = Array.from(dom.window.document.querySelectorAll('#mos-paginator a'));
        monthLinks.forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                monthLinks.forEach(candidate => candidate.parentElement.classList.remove('active'));
                link.parentElement.classList.add('active');
            });
        });

        const container = dom.window.document.getElementById('btn-importExportPlacements-container');
        dom.window.document.getElementById('btn-importExportPlacements').addEventListener('click', () => {
            container.classList.add('open');
        });
        dom.window.document.querySelector('#btn-2 a').addEventListener('click', event => {
            event.preventDefault();
            exports.push(dom.window.document.querySelector('#mos-paginator li.active a').textContent.trim());
            container.classList.remove('open');
        });

        dom.window.__OPS_TOOLSHED_ACTUALISE_EXPORT_TEST_TIMING__ = {
            monthChangeTimeoutMs: 200,
            readyStableMs: 1,
            exportTriggerGapMs: 1,
            menuOpenTimeoutMs: 100,
            statusDurationMs: 100
        };
        dom.window.utils = {
            findVisibleLoadingSpinners: jest.fn(() => [])
        };
        dom.window.eval(featureCode);
        return { dom, window: dom.window, exports };
    }

    test('adds one native-style option immediately after Export actuals view', () => {
        const { dom, window } = createFeature();
        window.actualiseExportAllFeature.initialize();
        window.actualiseExportAllFeature.apply();

        const item = window.document.getElementById('toolshed-export-all-actuals');
        expect(item).not.toBeNull();
        expect(item.previousElementSibling.id).toBe('btn-2');
        expect(item.textContent).toBe('Export every month’s actuals view');
        expect(window.document.querySelectorAll('#toolshed-export-all-actuals')).toHaveLength(1);
        dom.window.close();
    });

    test('does not offer a bulk action when only one month is visible', () => {
        const { dom, window } = createFeature({ months: ['Jan 26'], activeMonth: 'Jan 26' });
        window.actualiseExportAllFeature.initialize();

        expect(window.document.getElementById('toolshed-export-all-actuals')).toBeNull();
        dom.window.close();
    });

    test('recreates the option after Prisma replaces its dropdown', () => {
        const { dom, window } = createFeature();
        window.actualiseExportAllFeature.initialize();

        const oldMenu = window.document.getElementById('import-export-placements');
        const replacement = oldMenu.cloneNode(true);
        replacement.querySelector('#toolshed-export-all-actuals')?.remove();
        oldMenu.replaceWith(replacement);
        window.actualiseExportAllFeature.apply();

        expect(window.document.querySelectorAll('#toolshed-export-all-actuals')).toHaveLength(1);
        expect(window.document.getElementById('toolshed-export-all-actuals').previousElementSibling.id)
            .toBe('btn-2');
        dom.window.close();
    });

    test('exports each visible month in order and restores the starting month', async () => {
        const { dom, window, exports } = createFeature();
        window.actualiseExportAllFeature.initialize();

        await window.actualiseExportAllFeature.exportAllMonths();

        expect(exports).toEqual(['Jan 26', 'Feb 26', 'Mar 26']);
        expect(window.document.querySelector('#mos-paginator li.active a').textContent).toBe('Feb 26');
        expect(window.document.getElementById('toolshed-export-all-actuals-status').textContent)
            .toContain('Started actuals view exports for all 3 months.');
        expect(window.actualiseExportAllFeature.isRunning()).toBe(false);
        dom.window.close();
    });
});
