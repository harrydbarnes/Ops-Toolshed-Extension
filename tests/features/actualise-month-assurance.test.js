const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-month-assurance.js'),
    'utf8'
);

describe('Actualise month assurance', () => {
    const monthKeys = {
        'Oct 25': '2025-10',
        'Nov 25': '2025-11',
        'Dec 25': '2025-12'
    };

    function emitNativeEvidence(window, responseMonths, requestMonth = '2025-11') {
        window.dispatchEvent(new window.MessageEvent('message', {
            source: window,
            origin: window.location.origin,
            data: {
                source: 'ops-toolshed-actualise-month-bridge',
                type: 'ops-toolshed-actualise-month-data',
                detail: {
                    campaignId: 'CP123',
                    requestMonth,
                    responseMonths,
                    rowCount: responseMonths.length ? 1 : 0
                }
            }
        }));
    }

    function createFeature({
        activeMonth = 'Nov 25',
        urlMonth = '2025-11',
        responseMonths = ['2025-11'],
        responseByMonth = {},
        months = Object.keys(monthKeys),
        enabled = true,
        monthControl = 'legacy'
    } = {}) {
        const monthItems = months.map(month =>
            `<li class="${month === activeMonth ? 'active' : ''}"><a>${month}</a></li>`
        ).join('');
        const dom = new JSDOM(`<!doctype html><html><head></head><body>
            <div class="workflow-widget-wrapper">
                <button class="gmi-chat-button">GMI Chat</button>
            </div>
            <div id="month-filter-toolbar">
                <div id="mos-paginator"><ul>${monthItems}</ul></div>
                <div class="mo-caption mo-text-bold">${activeMonth}:</div>
            </div>
            <div id="grid-container_hot">
                <div class="ht_master"><table class="htCore">
                    <thead><tr><th>Name</th><th>Start date</th><th>End date</th></tr></thead>
                    <tbody><tr><td>Booking</td><td>14/10/2025</td><td>14/11/2025</td></tr></tbody>
                </table></div>
            </div>
        </body></html>`, {
            runScripts: 'dangerously',
            url: `https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=${urlMonth}-01`
        });

        dom.window.__OPS_TOOLSHED_ACTUALISE_MONTH_TEST_TIMING__ = {
            recoveryTimeoutMs: 250,
            pollMs: 1,
            readyStableMs: 1
        };
        const settingListeners = [];
        dom.window.chrome = {
            storage: {
                sync: {
                    get: (_defaults, callback) => callback({ actualiseMonthAssuranceEnabled: enabled })
                },
                onChanged: { addListener: listener => settingListeners.push(listener) }
            }
        };

        const clickedMonths = [];
        const responseQueues = new Map(Object.entries(responseByMonth));
        Array.from(dom.window.document.querySelectorAll('#mos-paginator a')).forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                const label = link.textContent.trim();
                const month = monthKeys[label];
                clickedMonths.push(label);
                dom.window.document.querySelectorAll('#mos-paginator li').forEach(item => {
                    item.classList.toggle('active', item.querySelector('a') === link);
                });
                dom.window.document.querySelector('.mo-caption').textContent = `${label}:`;
                dom.window.history.replaceState(
                    {},
                    '',
                    `#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=${month}-01`
                );
                const gridCell = dom.window.document.querySelector('#grid-container_hot tbody td');
                gridCell.textContent = `Booking ${month}`;
                const queue = responseQueues.get(month) || [responseMonths];
                const nextEvidence = queue.length > 1 ? queue.shift() : queue[0];
                emitNativeEvidence(dom.window, nextEvidence, month);
            });
        });

        if (monthControl === 'button-group') {
            dom.window.document.querySelector('#month-filter-toolbar').remove();
            const monthGroup = dom.window.document.createElement('div');
            monthGroup.className = 'actual-months-group';
            monthGroup.innerHTML = `<mo-button-group class="month-button-group" role="group">${months.map(month =>
                `<mo-button-group-item role="button" aria-pressed="${month === activeMonth}">${month}</mo-button-group-item>`
            ).join('')}</mo-button-group>`;
            dom.window.document.body.insertBefore(monthGroup, dom.window.document.querySelector('#grid-container_hot'));

            Array.from(monthGroup.querySelectorAll('mo-button-group-item')).forEach(button => {
                button.addEventListener('click', event => {
                    event.preventDefault();
                    const label = button.textContent.trim();
                    const month = monthKeys[label];
                    clickedMonths.push(label);
                    monthGroup.querySelectorAll('mo-button-group-item').forEach(item => {
                        item.setAttribute('aria-pressed', String(item === button));
                    });
                    dom.window.history.replaceState(
                        {},
                        '',
                        `#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=${month}-01`
                    );
                    const gridCell = dom.window.document.querySelector('#grid-container_hot tbody td');
                    gridCell.textContent = `Booking ${month}`;
                    const queue = responseQueues.get(month) || [responseMonths];
                    const nextEvidence = queue.length > 1 ? queue.shift() : queue[0];
                    emitNativeEvidence(dom.window, nextEvidence, month);
                });
            });
        }

        dom.window.eval(featureCode);
        return {
            dom,
            window: dom.window,
            clickedMonths,
            setEnabled: value => settingListeners.forEach(listener => listener({
                actualiseMonthAssuranceEnabled: { newValue: value }
            }, 'sync')),
            emitEvidence: (months, requestMonth = urlMonth) =>
                emitNativeEvidence(dom.window, months, requestMonth)
        };
    }

    test('shows a green Correct Month badge only when URL, paginator, grid and native response agree', async () => {
        const feature = createFeature();

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-11']);
        await new Promise(resolve => feature.window.setTimeout(resolve, 0));

        const badge = feature.window.document.querySelector('.toolshed-actualise-month-assurance');
        expect(feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth()).toMatchObject({
            status: 'correct',
            expectedMonth: '2025-11',
            activeMonth: '2025-11',
            responseMonths: ['2025-11']
        });
        expect(badge.textContent).toBe('Correct Month');
        expect(badge.classList).toContain('toolshed-actualise-month-assurance--correct');
        expect(badge.getAttribute('role')).toBe('status');
        expect(badge.hasAttribute('title')).toBe(false);

        badge.getBoundingClientRect = () => ({ left: 40, width: 90, bottom: 70 });
        badge.dispatchEvent(new feature.window.MouseEvent('mouseenter'));
        const tooltip = feature.window.document.querySelector('.toolshed-actualise-month-assurance-tooltip');
        expect(tooltip.parentElement).toBe(feature.window.document.body);
        expect(tooltip.getAttribute('role')).toBe('tooltip');
        expect(tooltip.textContent).toContain('native response all confirm Nov 25');
        expect(tooltip.hidden).toBe(false);
        expect(badge.getAttribute('aria-describedby')).toBe(tooltip.id);
        badge.dispatchEvent(new feature.window.MouseEvent('mouseleave'));
        expect(tooltip.hidden).toBe(true);

        feature.dom.window.close();
    });

    test('stays green when horizontal scrolling splits frozen columns across Handsontable tables', async () => {
        const feature = createFeature();

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-11']);

        const grid = feature.window.document.querySelector('#grid-container_hot');
        const mainTable = grid.querySelector('.ht_master .htCore');
        mainTable.querySelector('thead th').remove();

        const frozenTable = feature.window.document.createElement('table');
        frozenTable.className = 'htCore';
        frozenTable.innerHTML = '<thead><tr><th>Name</th><th>Placement ID</th></tr></thead>' +
            '<tbody><tr><td>Booking</td><td>P3993TB</td></tr></tbody>';
        const frozenHolder = feature.window.document.createElement('div');
        frozenHolder.className = 'ht_clone_left';
        frozenHolder.appendChild(frozenTable);
        grid.appendChild(frozenHolder);

        feature.window.actualiseMonthAssuranceFeature.apply();
        const assessment = feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth();
        const badgeText = feature.window.document.querySelector('.toolshed-actualise-month-assurance').textContent;
        feature.dom.window.close();

        expect(assessment).toMatchObject({
            status: 'correct',
            expectedMonth: '2025-11',
            activeMonth: '2025-11',
            responseMonths: ['2025-11']
        });
        expect(badgeText).toBe('Correct Month');
    });

    test('supports the native Actualise month button group', async () => {
        const feature = createFeature({
            monthControl: 'button-group',
            responseByMonth: {
                '2025-10': [['2025-10']],
                '2025-11': [['2025-11']]
            }
        });

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-10']);
        await new Promise(resolve => feature.window.setTimeout(resolve, 25));

        const clickedMonths = [...feature.clickedMonths];
        const assessment = feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth();
        const badgeText = feature.window.document.querySelector('.toolshed-actualise-month-assurance')?.textContent;
        feature.dom.window.close();

        expect(clickedMonths).toEqual(['Oct 25', 'Nov 25']);
        expect(assessment).toMatchObject({
            status: 'correct',
            expectedMonth: '2025-11',
            activeMonth: '2025-11',
            responseMonths: ['2025-11']
        });
        expect(badgeText).toBe('Correct Month');
    });

    test('marks a native response month mismatch yellow and cycles another month before returning', async () => {
        const feature = createFeature({
            responseByMonth: {
                '2025-10': [['2025-10']],
                '2025-11': [['2025-11']]
            }
        });

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-10']);
        await new Promise(resolve => feature.window.setTimeout(resolve, 25));

        expect(feature.clickedMonths).toEqual(['Oct 25', 'Nov 25']);
        expect(feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth()).toMatchObject({
            status: 'correct',
            expectedMonth: '2025-11',
            activeMonth: '2025-11',
            responseMonths: ['2025-11']
        });
        const badge = feature.window.document.querySelector('.toolshed-actualise-month-assurance');
        expect(badge.textContent).toBe('Correct Month');
        expect(badge.classList).toContain('toolshed-actualise-month-assurance--correct');

        feature.dom.window.close();
    });

    test('cancels pending recovery quietly when the user leaves Actualise for Buy', async () => {
        const feature = createFeature({
            responseByMonth: {
                '2025-10': [['2025-11']]
            }
        });
        const warn = jest.spyOn(feature.window.console, 'warn').mockImplementation(() => {});

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-10']);
        feature.window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital&route=online'
        );
        await new Promise(resolve => feature.window.setTimeout(resolve, 300));

        expect(warn).not.toHaveBeenCalled();
        expect(feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth()).toMatchObject({
            status: 'hidden'
        });

        warn.mockRestore();
        feature.dom.window.close();
    });

    test('re-queries the target month control after Prisma replaces the controls', async () => {
        const feature = createFeature({
            responseByMonth: {
                '2025-10': [['2025-10']],
                '2025-11': [['2025-11']]
            }
        });
        const originalAlternate = feature.window.document.querySelector('#mos-paginator li:not(.active) a');
        const originalClick = originalAlternate.click.bind(originalAlternate);
        let replacementClickCount = 0;
        originalAlternate.click = () => {
            originalClick();
            const paginator = feature.window.document.querySelector('#mos-paginator');
            const replacement = paginator.cloneNode(true);
            paginator.replaceWith(replacement);
            const replacementTarget = replacement.querySelector('li:not(.active) a');
            replacementTarget.addEventListener('click', event => {
                event.preventDefault();
                const label = replacementTarget.textContent.trim();
                const month = monthKeys[label];
                replacement.querySelectorAll('li').forEach(item => {
                    item.classList.toggle('active', item.querySelector('a') === replacementTarget);
                });
                feature.window.document.querySelector('.mo-caption').textContent = `${label}:`;
                feature.window.history.replaceState(
                    {},
                    '',
                    `#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=${month}-01`
                );
                feature.window.document.querySelector('#grid-container_hot tbody td').textContent = `Booking ${month}`;
                feature.emitEvidence([month], month);
            });
            const replacementClick = replacementTarget.click.bind(replacementTarget);
            replacementTarget.click = () => {
                replacementClickCount += 1;
                replacementClick();
            };
        };

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-10']);
        await new Promise(resolve => feature.window.setTimeout(resolve, 25));

        expect(replacementClickCount).toBe(1);
        expect(feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth()).toMatchObject({
            status: 'correct',
            expectedMonth: '2025-11',
            activeMonth: '2025-11'
        });

        feature.dom.window.close();
    });

    test('keeps the badge yellow when the URL and selected month disagree', () => {
        const feature = createFeature({
            activeMonth: 'Oct 25',
            urlMonth: '2025-11',
            months: ['Oct 25']
        });

        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-11']);
        feature.window.actualiseMonthAssuranceFeature.apply();

        const assessment = feature.window.actualiseMonthAssuranceFeature.assessActualiseMonth();
        const badge = feature.window.document.querySelector('.toolshed-actualise-month-assurance');
        expect(assessment).toMatchObject({
            status: 'incorrect',
            expectedMonth: '2025-11',
            activeMonth: '2025-10'
        });
        expect(badge.textContent).toBe('Check Month');
        expect(badge.classList).toContain('toolshed-actualise-month-assurance--incorrect');

        feature.dom.window.close();
    });

    test('removes the badge immediately when disabled from Settings and restores it when re-enabled', async () => {
        const feature = createFeature();
        feature.window.actualiseMonthAssuranceFeature.initialize();
        feature.emitEvidence(['2025-11']);
        await new Promise(resolve => feature.window.setTimeout(resolve, 0));

        feature.setEnabled(false);
        expect(feature.window.document.querySelector('.toolshed-actualise-month-assurance')).toBeNull();

        feature.setEnabled(true);
        expect(feature.window.document.querySelector('.toolshed-actualise-month-assurance')?.textContent)
            .toBe('Correct Month');
        feature.dom.window.close();
    });
});
