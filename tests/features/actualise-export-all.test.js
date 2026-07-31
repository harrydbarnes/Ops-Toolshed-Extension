const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-export-all.js'),
    'utf8'
);
const contentStyles = fs.readFileSync(
    path.resolve(__dirname, '../../content.css'),
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
        const combineItem = window.document.getElementById('toolshed-combine-actuals');
        expect(item).not.toBeNull();
        expect(item.previousElementSibling.id).toBe('btn-2');
        expect(item.textContent).toBe('Export every month’s actuals view');
        expect(combineItem.previousElementSibling).toBe(item);
        expect(combineItem.textContent).toBe('Combine downloaded actuals views');
        expect(window.document.querySelectorAll('#toolshed-export-all-actuals')).toHaveLength(1);
        expect(window.document.querySelectorAll('#toolshed-combine-actuals')).toHaveLength(1);
        dom.window.close();
    });

    test('matches the shared switching-account toast typography, spacing and success colour', () => {
        expect(contentStyles).toMatch(
            /#toolshed-export-all-actuals-status\s*\{[^}]*padding:\s*15px;[^}]*background:\s*#333668;[^}]*font-family:\s*sans-serif;[^}]*font-size:\s*16px;/s
        );
        expect(contentStyles).toMatch(
            /\.toolshed-export-all-actuals-cancel\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);[^}]*font-family:\s*inherit;/s
        );
    });

    test('does not offer a bulk action when only one month is visible', () => {
        const { dom, window } = createFeature({ months: ['Jan 26'], activeMonth: 'Jan 26' });
        window.actualiseExportAllFeature.initialize();

        expect(window.document.getElementById('toolshed-export-all-actuals')).toBeNull();
        dom.window.close();
    });

    test('opens a multi-select CSV picker from the combine menu item', () => {
        const { dom, window } = createFeature();
        window.actualiseExportAllFeature.initialize();

        window.document.querySelector('#toolshed-combine-actuals a').click();

        const input = window.document.getElementById('toolshed-combine-actuals-input');
        expect(input).not.toBeNull();
        expect(input.type).toBe('file');
        expect(input.multiple).toBe(true);
        expect(input.accept).toBe('.csv,text/csv');
        dom.window.close();
    });

    test('recreates the option after Prisma replaces its dropdown', () => {
        const { dom, window } = createFeature();
        window.actualiseExportAllFeature.initialize();

        const oldMenu = window.document.getElementById('import-export-placements');
        const replacement = oldMenu.cloneNode(true);
        replacement.querySelector('#toolshed-export-all-actuals')?.remove();
        replacement.querySelector('#toolshed-combine-actuals')?.remove();
        oldMenu.replaceWith(replacement);
        window.actualiseExportAllFeature.apply();

        expect(window.document.querySelectorAll('#toolshed-export-all-actuals')).toHaveLength(1);
        expect(window.document.querySelectorAll('#toolshed-combine-actuals')).toHaveLength(1);
        expect(window.document.getElementById('toolshed-export-all-actuals').previousElementSibling.id)
            .toBe('btn-2');
        dom.window.close();
    });

    test('does not create self-sustaining child or attribute mutations when the page observer reapplies it', async () => {
        const { dom, window } = createFeature();
        window.actualiseExportAllFeature.initialize();

        let mutationBatches = 0;
        await new Promise(resolve => {
            const observer = new window.MutationObserver(() => {
                mutationBatches += 1;
                window.actualiseExportAllFeature.apply();
                if (mutationBatches >= 5) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(window.document.body, {
                attributes: true,
                childList: true,
                subtree: true
            });
            window.actualiseExportAllFeature.apply();
            window.setTimeout(() => {
                observer.disconnect();
                resolve();
            }, 25);
        });

        expect(mutationBatches).toBe(0);
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
        expect(window.document.querySelector('.toolshed-export-all-actuals-combine').hidden).toBe(false);
        expect(window.actualiseExportAllFeature.isRunning()).toBe(false);
        dom.window.close();
    });

    test('combines monthly CSVs in month order with only the first header', async () => {
        const { dom, window } = createFeature();
        const files = [
            {
                name: 'Actualization-CP37TC2-HBARN-2026-02.csv',
                size: 100,
                text: jest.fn(async () => 'Month,Name,Notes\r\n2026-02,Second,"Line one\r\nLine two",\r\n')
            },
            {
                name: 'Actualization-CP37TC2-HBARN-2026-01.csv',
                size: 100,
                text: jest.fn(async () => 'Month,Name,Notes\r\n2026-01,First,"Hello, world"\r\n')
            }
        ];

        const result = await window.actualiseExportAllFeature.mergeActualizationCsvFiles(files);
        const rows = window.actualiseExportAllFeature.parseCsvRows(result.csv);

        expect(result.filename)
            .toBe('Actualization-CP37TC2-HBARN-2026-01-to-2026-02.csv');
        expect(result).toEqual(expect.objectContaining({ fileCount: 2, rowCount: 2 }));
        expect(rows).toEqual([
            ['Month', 'Name', 'Notes'],
            ['2026-01', 'First', 'Hello, world'],
            ['2026-02', 'Second', 'Line one\r\nLine two']
        ]);
        expect(result.csv.match(/Month,Name,Notes/g)).toHaveLength(1);
        expect(result.csv.startsWith('\uFEFF')).toBe(true);
        dom.window.close();
    });

    test('still rejects a surplus trailing field when it contains data', async () => {
        const { dom, window } = createFeature();
        const file = (name, csv) => ({
            name,
            size: csv.length,
            text: jest.fn(async () => csv)
        });

        await expect(window.actualiseExportAllFeature.mergeActualizationCsvFiles([
            file('Actualization-CP1-HBARN-2026-01.csv', 'Month,Value\r\n2026-01,1'),
            file('Actualization-CP1-HBARN-2026-02.csv', 'Month,Value\r\n2026-02,2,unexpected')
        ])).rejects.toThrow('different column count');
        dom.window.close();
    });

    test('neutralizes spreadsheet formulas while preserving signed numeric values', async () => {
        const { dom, window } = createFeature();
        const file = (name, csv) => ({
            name,
            size: csv.length,
            text: jest.fn(async () => csv)
        });

        const result = await window.actualiseExportAllFeature.mergeActualizationCsvFiles([
            file(
                'Actualization-CP1-HBARN-2026-01.csv',
                'Month,Formula,Negative,Positive,At\r\n2026-01,=1+1,-123.45,+42,@SUM(A1:A2)'
            ),
            file(
                'Actualization-CP1-HBARN-2026-02.csv',
                'Month,Formula,Negative,Positive,At\r\n2026-02,+CMD,"-SUM(A1,A2)",0,Safe'
            )
        ]);

        expect(window.actualiseExportAllFeature.parseCsvRows(result.csv)).toEqual([
            ['Month', 'Formula', 'Negative', 'Positive', 'At'],
            ['2026-01', "'=1+1", '-123.45', '+42', "'@SUM(A1:A2)"],
            ['2026-02', "'+CMD", "'-SUM(A1,A2)", '0', 'Safe']
        ]);
        dom.window.close();
    });

    test('rejects different headers, campaigns and duplicate months', async () => {
        const { dom, window } = createFeature();
        const file = (name, csv) => ({
            name,
            size: csv.length,
            text: jest.fn(async () => csv)
        });

        await expect(window.actualiseExportAllFeature.mergeActualizationCsvFiles([
            file('Actualization-CP1-HBARN-2026-01.csv', 'Month,Value\r\n2026-01,1'),
            file('Actualization-CP1-HBARN-2026-02.csv', 'Month,Amount\r\n2026-02,2')
        ])).rejects.toThrow('different columns');

        await expect(window.actualiseExportAllFeature.mergeActualizationCsvFiles([
            file('Actualization-CP1-HBARN-2026-01.csv', 'Month,Value\r\n2026-01,1'),
            file('Actualization-CP2-HBARN-2026-02.csv', 'Month,Value\r\n2026-02,2')
        ])).rejects.toThrow('one campaign and user');

        await expect(window.actualiseExportAllFeature.mergeActualizationCsvFiles([
            file('Actualization-CP1-HBARN-2026-01.csv', 'Month,Value\r\n2026-01,1'),
            file('Actualization-CP1-HBARN-2026-01 (1).csv', 'Month,Value\r\n2026-01,1')
        ])).rejects.toThrow('More than one CSV');
        dom.window.close();
    });
});
