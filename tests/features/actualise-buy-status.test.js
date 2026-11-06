const { JSDOM } = require('jsdom');
const path = require('path');
const { readScript } = require('../helpers/read-script');

const featureScript = readScript(path.resolve(__dirname, '../../features/actualise-buy-status.js'));

describe('Actualise Buy status indicators', () => {
    let dom;
    let window;
    let document;

    const actualiseUrl = 'https://go.mediaocean.com/campaign-management/#campaign-id=CP1&ptb-ctx=actualize&route=actualize';

    function setupPage(markup = '') {
        dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
            url: actualiseUrl,
            runScripts: 'outside-only'
        });
        window = dom.window;
        document = window.document;
        window.eval(featureScript);
        return window.actualiseBuyStatusFeature;
    }

    function gridMarkup({ nameRows, statusRows }) {
        return `
            <div id="grid-container_hot">
                <div class="ht_master"><table class="htCore"><tbody>${statusRows}</tbody></table></div>
                <div class="ht_clone_left"><table class="htCore"><tbody>${nameRows}</tbody></table></div>
            </div>
        `;
    }

    afterEach(() => {
        if (dom) dom.window.close();
        dom = null;
        window = null;
        document = null;
    });

    test('places the native status icons beside their matching placement names', () => {
        const feature = setupPage(gridMarkup({
            nameRows: '<tr><td id="placementName-2">Placement A</td></tr><tr><td id="placementName-3">Placement B</td></tr>',
            statusRows: '<tr><td id="buyStatus-2"><i class="buy-status fa fa-check-circle successful" style="color: rgb(40, 129, 65)"></i><span>Successful</span></td></tr><tr><td id="buyStatus-3"><i class="buy-status fa fa-clock-o pending"></i><span>Pending</span></td></tr>'
        }));

        feature.initialize();

        const successIndicator = document.querySelector('#placementName-2 .toolshed-actualise-buy-status-indicator');
        const pendingIndicator = document.querySelector('#placementName-3 .toolshed-actualise-buy-status-indicator');
        expect(successIndicator).not.toBeNull();
        expect(successIndicator.firstElementChild.className).toContain('fa-check-circle');
        expect(successIndicator.firstElementChild.className).toContain('successful');
        expect(successIndicator.firstElementChild.style.color).toBe('rgb(40, 129, 65)');
        expect(successIndicator.getAttribute('aria-label')).toBe('Buy status: Successful');
        expect(pendingIndicator.firstElementChild.className).toContain('fa-clock-o');
        expect(pendingIndicator.firstElementChild.className).toContain('pending');
        expect(pendingIndicator.getAttribute('aria-label')).toBe('Buy status: Pending');
        expect(document.getElementById('placementName-2').textContent).toBe('Placement A');
        expect(document.querySelectorAll('.toolshed-actualise-buy-status-indicator')).toHaveLength(2);
    });

    test('refreshes the copied icon and accessible label when Prisma changes a status', () => {
        const feature = setupPage(gridMarkup({
            nameRows: '<tr><td id="placementName-8">Placement C</td></tr>',
            statusRows: '<tr><td id="buyStatus-8"><i class="buy-status fa fa-check-circle successful"></i><span>Successful</span></td></tr>'
        }));
        feature.initialize();

        const statusCell = document.getElementById('buyStatus-8');
        statusCell.querySelector('i').className = 'buy-status fa fa-times-circle error';
        statusCell.querySelector('span').textContent = 'Error';
        feature.apply();

        const indicator = document.querySelector('#placementName-8 .toolshed-actualise-buy-status-indicator');
        expect(indicator.firstElementChild.className).toContain('fa-times-circle');
        expect(indicator.firstElementChild.className).toContain('error');
        expect(indicator.getAttribute('aria-label')).toBe('Buy status: Error');

        statusCell.querySelector('i').remove();
        feature.apply();
        expect(document.querySelector('#placementName-8 .toolshed-actualise-buy-status-indicator')).toBeNull();
    });

    test('keeps a captured status icon when Handsontable virtualizes the status column away', () => {
        const feature = setupPage(gridMarkup({
            nameRows: '<tr><td id="placementName-5">Placement with status</td></tr>',
            statusRows: '<tr><td id="buyStatus-5"><i class="buy-status fa fa-check-circle successful"></i><span>Successful</span></td></tr>'
        }));
        feature.initialize();

        document.getElementById('buyStatus-5').remove();
        feature.apply();

        const indicator = document.querySelector('#placementName-5 .toolshed-actualise-buy-status-indicator');
        expect(indicator).not.toBeNull();
        expect(indicator.firstElementChild.className).toContain('fa-check-circle');
        expect(indicator.getAttribute('aria-label')).toBe('Buy status: Successful');
    });

    test('samples the virtualized status column and restores the user scroll position', () => {
        const statusMarkup = '<tr><td id="buyStatus-7"><i class="buy-status fa fa-clock-o pending"></i><span>Pending</span></td></tr>';
        const feature = setupPage(`
            <div id="grid-container_hot">
                <div class="ht_master"><div class="wtHolder"><table class="htCore"><tbody id="status-rows"></tbody></table></div></div>
                <div class="ht_clone_left"><table class="htCore"><tbody><tr><td id="placementName-7">Placement with pending status</td></tr></tbody></table></div>
            </div>
        `);
        const scroller = document.querySelector('#grid-container_hot .ht_master > .wtHolder');
        const statusRows = document.getElementById('status-rows');
        const animationFrames = [];
        let scrollLeft = 0;
        let frameId = 0;
        Object.defineProperties(scroller, {
            clientWidth: { configurable: true, get: () => 800 },
            scrollWidth: { configurable: true, get: () => 2400 },
            scrollLeft: {
                configurable: true,
                get: () => scrollLeft,
                set: value => {
                    scrollLeft = value;
                    statusRows.innerHTML = value > 0 ? statusMarkup : '';
                }
            }
        });
        window.requestAnimationFrame = callback => {
            animationFrames.push(callback);
            frameId += 1;
            return frameId;
        };

        feature.initialize();
        expect(scrollLeft).toBe(0);
        expect(animationFrames).toHaveLength(1);

        animationFrames.shift()();
        expect(scrollLeft).toBe(1600);
        animationFrames.shift()();
        expect(scrollLeft).toBe(0);
        animationFrames.shift()();

        const indicator = document.querySelector('#placementName-7 .toolshed-actualise-buy-status-indicator');
        expect(indicator).not.toBeNull();
        expect(indicator.firstElementChild.className).toContain('pending');
        expect(indicator.getAttribute('aria-label')).toBe('Buy status: Pending');
        expect(scroller.scrollLeft).toBe(0);
        expect(document.querySelector('#grid-container_hot #buyStatus-7')).toBeNull();
    });

    test('omits rows with no native status icon and removes indicators outside Actualise', () => {
        const feature = setupPage(gridMarkup({
            nameRows: '<tr><td id="placementName-0">Group total</td></tr><tr><td id="placementName-2">Placement A</td></tr><tr><td id="placementName-4">Placement without status</td></tr>',
            statusRows: '<tr><td id="buyStatus-0"></td></tr><tr><td id="buyStatus-2"><i class="buy-status fa fa-exclamation-circle failed"></i><span>Failed</span></td></tr>'
        }));
        feature.initialize();

        expect(document.querySelectorAll('.toolshed-actualise-buy-status-indicator')).toHaveLength(1);
        expect(document.querySelector('#placementName-2 .toolshed-actualise-buy-status-indicator').getAttribute('aria-label'))
            .toBe('Buy status: Failed');

        window.location.hash = '#campaign-id=CP1&ptb-mod=buy';
        feature.apply();

        expect(document.querySelectorAll('.toolshed-actualise-buy-status-indicator')).toHaveLength(0);
    });
});
