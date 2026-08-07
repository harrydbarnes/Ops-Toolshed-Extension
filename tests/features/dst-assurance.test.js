const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dstAssuranceScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/dst-assurance.js'),
    'utf8'
);
const contentStyles = fs.readFileSync(
    path.resolve(__dirname, '../../content.css'),
    'utf8'
);

function createRow({ name, cost = '', groupLevel = null, hierarchyLevel = 1 }) {
    const groupClasses = groupLevel === null
        ? ''
        : ` group-cell hierarchical-level-group-${groupLevel}`;
    const nameClasses = `${groupClasses} indent hierarchical-name hierarchical-level-${hierarchyLevel}`.trim();
    return `<tr role="row">
        <td></td><td></td><td class="${groupClasses.trim()}"></td>
        <td class="${nameClasses}">${name}</td>
        <td></td><td></td><td></td><td></td><td>${cost}</td>
    </tr>`;
}

function createPage({
    mediaSection = 'Display',
    mediaSupplier = 'FACEBOOK(Facebook Mediacom)',
    mediaCost = '£32,320.60',
    feeSupplier = 'META DIGITAL SERVICE CHARGE (GBP):Meta Digital Service Charge',
    feeCost = '£646.41',
    feeDetailName = 'Meta Digital Service Charge_Meta 2% DST GBP_Fee',
    feeDetailCost = feeCost,
    includeFee = true
} = {}) {
    const feeRows = includeFee
        ? `${createRow({ name: feeSupplier, groupLevel: 1, hierarchyLevel: 0, cost: feeCost })}
           ${createRow({ name: feeDetailName, cost: feeDetailCost })}`
        : '';
    const dom = new JSDOM(`<!doctype html><html><body>
        <div class="workflow-widget-wrapper">
            <div class="label label-left label-success">APPROVED</div>
            <div class="btn-group"><button id="workflow-widget-button"></button></div>
            <button class="gmi-chat-button">GMI Chat</button>
        </div>
        <div id="grid-container_hot"><div class="ht_master"><table class="htCore"><tbody>
            <tr role="row"><td></td><td></td><td></td><td>Name</td><td></td><td></td><td></td><td></td><td>Cost</td></tr>
            ${createRow({ name: 'Media total', groupLevel: 0, hierarchyLevel: 0, cost: mediaCost })}
            ${createRow({ name: mediaSection, groupLevel: 0, hierarchyLevel: 0, cost: mediaCost })}
            ${createRow({ name: mediaSupplier, groupLevel: 1, hierarchyLevel: 0, cost: mediaCost })}
            ${createRow({ name: 'FACEBOOK_Liz Earle package', cost: mediaCost })}
            ${createRow({ name: 'Fee', groupLevel: 0, hierarchyLevel: 0, cost: feeCost })}
            ${feeRows}
        </tbody></table></div></div>
    </body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital',
        runScripts: 'outside-only'
    });
    dom.window.eval(dstAssuranceScript);
    return dom;
}

describe('DST Assurance', () => {
    test('labels a campaign with more than one booked DST as DSTs Booked', () => {
        const dom = createPage();
        const tableBody = dom.window.document.querySelector('.ht_master .htCore tbody');
        const feeSectionRow = Array.from(tableBody.querySelectorAll('tr'))
            .find(row => row.children[3]?.textContent.trim() === 'Fee');

        feeSectionRow.insertAdjacentHTML(
            'beforebegin',
            createRow({
                name: 'GOOGLE ADS (GBP):Campaign',
                groupLevel: 1,
                hierarchyLevel: 0,
                cost: '£1,000.00'
            })
        );
        feeSectionRow.insertAdjacentHTML(
            'afterend',
            createRow({
                name: 'GOOGLE DIGITAL SERVICE CHARGE (GBP):Google Digital Service Charge',
                groupLevel: 1,
                hierarchyLevel: 0,
                cost: '£0.00'
            })
        );

        dom.window.dstAssuranceFeature.apply();

        expect(dom.window.document.querySelector('.toolshed-dst-assurance').textContent)
            .toBe('DSTs Booked');
        expect(dom.window.document.querySelector('.toolshed-dst-assurance-tooltip').textContent)
            .toBe('Please verify Google DST cost is correct, as that is not checked currently');
        dom.window.close();
    });

    test('recognises Google Ads GBP when the related service-charge supplier is correct without checking cost', () => {
        const dom = createPage({
            mediaSection: 'Search',
            mediaSupplier: 'GOOGLE ADS (GBP):SEARCH',
            mediaCost: '£1,000.00',
            feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (GBP):Google Digital Service Charge',
            feeCost: '£0.00'
        });

        const feature = dom.window.dstAssuranceFeature;
        expect(feature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'correct',
            supplierCorrect: true,
            amountCorrect: true
        });
        feature.apply();
        expect(dom.window.document.querySelector('.toolshed-dst-assurance').textContent)
            .toBe('DST Booked');
        expect(dom.window.document.querySelector('.toolshed-dst-assurance-tooltip').textContent)
            .toBe('Please verify Google DST cost is correct, as that is not checked currently');
        dom.window.close();
    });

    test.each([
        ['GOOGLE ADS (EUR)', 'GOOGLE DIGITAL SERVICE CHARGE (EUR)'],
        ['DV360 (EUR)', 'DV360 DIGITAL SERVICE CHARGE (EUR)'],
        ['GOOGLE ADS (GBP)', 'GOOGLE DIGITAL SERVICE CHARGE (GBP)'],
        ['GOOGLE ADS-YOU TUBE (GBP)', 'GOOGLE DIGITAL SERVICE CHARGE (GBP)'],
        ['SEARCH ADS 360 (GBP)', 'GOOGLE DIGITAL SERVICE CHARGE (GBP)'],
        ['YOUTUBE GOOGLE PREFERRED', 'GOOGLE DIGITAL SERVICE CHARGE (GBP)'],
        ['DV360 (GBP)', 'DV360 DIGITAL SERVICE CHARGE (GBP)'],
        ['GOOGLE ADS (USD)', 'GOOGLE DIGITAL SERVICE CHARGE (USD)'],
        ['DV360 (USD)', 'DV360 DIGITAL SERVICE CHARGE (USD)']
    ])('recognises the Google DST mapping %s -> %s', (mediaSupplier, feeSupplier) => {
        const dom = createPage({
            mediaSupplier: `${mediaSupplier}:Campaign`,
            mediaCost: '£1,000.00',
            feeSupplier: `${feeSupplier}:Service Charge`,
            feeCost: '£0.00'
        });

        expect(dom.window.dstAssuranceFeature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'correct',
            supplierCorrect: true,
            amountCorrect: true
        });
        dom.window.close();
    });

    test('recognises an Amazon DST supplier without checking cost and explains that limitation', () => {
        const dom = createPage({
            mediaSupplier: 'AMAZON (EUR):Campaign',
            mediaCost: 'Â£1,000.00',
            feeSupplier: 'AMAZON REG. ADVERTISING FEE (EUR):Amazon Advertising Fee',
            feeCost: 'Â£0.00'
        });
        const feature = dom.window.dstAssuranceFeature;

        expect(feature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'correct',
            supplierCorrect: true,
            amountCorrect: true
        });
        feature.apply();
        expect(dom.window.document.querySelector('.toolshed-dst-assurance-tooltip').textContent)
            .toBe('Please verify Amazon DST cost is correct, as that is not checked currently');
        dom.window.close();
    });

    test.each([
        ['AMAZON (EUR)', 'AMAZON REG. ADVERTISING FEE (EUR)'],
        ['AMAZON DSP (EUR)', 'AMAZON REG. ADVERTISING FEE (EUR)'],
        ['AMAZON (GBP)', 'AMAZON REG. ADVERTISING FEE (GBP)'],
        ['AMAZON DSP (GBP)', 'AMAZON REG. ADVERTISING FEE (GBP)'],
        ['AMAZON - TWITCH (GBP)', 'AMAZON REG. ADVERTISING FEE (GBP)'],
        ['IMDB', 'AMAZON REG. ADVERTISING FEE (GBP)'],
        ['AMAZON (USD)', 'AMAZON REG. ADVERTISING FEE (USD)']
    ])('recognises the Amazon DST mapping %s -> %s', (mediaSupplier, feeSupplier) => {
        const dom = createPage({
            mediaSupplier: `${mediaSupplier}:Campaign`,
            mediaCost: 'Â£1,000.00',
            feeSupplier: `${feeSupplier}:Service Charge`,
            feeCost: 'Â£0.00'
        });

        expect(dom.window.dstAssuranceFeature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'correct',
            supplierCorrect: true,
            amountCorrect: true
        });
        dom.window.close();
    });

    test('marks an Amazon service charge booked to the wrong supplier and highlights only its supplier cell', () => {
        const dom = createPage({
            mediaSupplier: 'AMAZON DSP (GBP):Campaign',
            mediaCost: 'Â£1,000.00',
            feeSupplier: 'FACEBOOK:AMAZON REG. ADVERTISING FEE (GBP)',
            feeCost: 'Â£0.00'
        });
        const feature = dom.window.dstAssuranceFeature;

        expect(feature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'incorrect',
            supplierCorrect: false,
            amountCorrect: true
        });
        expect(feature.assessDstAssurance().tooltip)
            .toContain('AMAZON REG. ADVERTISING FEE (GBP)');

        feature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('FACEBOOK:AMAZON REG. ADVERTISING FEE'));
        expect(feeRow.children[3].classList).toContain('toolshed-dst-assurance-warning-cell');
        expect(feeRow.children[8].classList).not.toContain('toolshed-dst-assurance-warning-cell');
        dom.window.close();
    });

    test('marks a Google service charge booked to the wrong supplier and highlights only its supplier cell', () => {
        const dom = createPage({
            mediaSupplier: 'DV360 (GBP):Campaign',
            mediaCost: '£1,000.00',
            feeSupplier: 'FACEBOOK:DV360 DIGITAL SERVICE CHARGE (GBP)',
            feeCost: '£0.00'
        });
        const feature = dom.window.dstAssuranceFeature;

        expect(feature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'incorrect',
            supplierCorrect: false,
            amountCorrect: true
        });
        expect(feature.assessDstAssurance().tooltip)
            .toContain('DV360 DIGITAL SERVICE CHARGE (GBP)');

        feature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('FACEBOOK:DV360 DIGITAL SERVICE CHARGE'));
        expect(feeRow.children[3].classList).toContain('toolshed-dst-assurance-warning-cell');
        expect(feeRow.children[8].classList).not.toContain('toolshed-dst-assurance-warning-cell');
        dom.window.close();
    });

    test('marks a Google media booking with no related service charge as incorrect without inventing a cell highlight', () => {
        const dom = createPage({
            mediaSupplier: 'GOOGLE ADS (EUR):Campaign',
            includeFee: false
        });
        const feature = dom.window.dstAssuranceFeature;

        expect(feature.assessDstAssurance()).toMatchObject({
            eligible: true,
            status: 'incorrect',
            supplierCorrect: false,
            amountCorrect: true
        });
        expect(feature.assessDstAssurance().tooltip)
            .toContain('GOOGLE DIGITAL SERVICE CHARGE (EUR)');

        feature.apply();
        expect(dom.window.document.querySelector('.toolshed-dst-assurance--incorrect'))
            .not.toBeNull();
        expect(dom.window.document.querySelectorAll('.toolshed-dst-assurance-warning-cell'))
            .toHaveLength(0);
        dom.window.close();
    });

    test('recognises a correctly supplied Meta DST at 2% of Facebook media', () => {
        const dom = createPage();
        const assessment = dom.window.dstAssuranceFeature.assessDstAssurance();

        expect(assessment).toMatchObject({
            eligible: true,
            status: 'correct',
            mediaBooked: 32320.60,
            feeBooked: 646.41,
            expectedFee: 646.41,
            supplierCorrect: true,
            amountCorrect: true
        });
        dom.window.close();
    });

    test('uses the Meta DST supplier row even when the child booking name differs', () => {
        const dom = createPage({
            feeDetailName: 'Meta Location Fee 2%',
            feeDetailCost: '£0.00'
        });
        const assessment = dom.window.dstAssuranceFeature.assessDstAssurance();

        expect(assessment).toMatchObject({
            status: 'correct',
            feeBooked: 646.41,
            supplierCorrect: true,
            amountCorrect: true
        });
        dom.window.dstAssuranceFeature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('Meta Location Fee 2%'));
        expect(feeRow.children[3].classList).not.toContain('toolshed-dst-assurance-warning-cell');
        expect(feeRow.children[8].classList).not.toContain('toolshed-dst-assurance-warning-cell');
        dom.window.close();
    });

    test('does not create a tooltip when the correct badge has no explanation', () => {
        const dom = createPage();
        const feature = dom.window.dstAssuranceFeature;

        feature.apply();

        const badge = dom.window.document.querySelector('.toolshed-dst-assurance');
        expect(badge.classList).toContain('toolshed-dst-assurance--correct');
        expect(dom.window.document.querySelector('.toolshed-dst-assurance-tooltip')).toBeNull();
        expect(badge.getAttribute('role')).toBe('status');
        expect(badge.getAttribute('tabindex')).toBeNull();
        expect(badge.getAttribute('aria-describedby')).toBeNull();
        dom.window.close();
    });

    test('marks a Meta DST booked to the standard Facebook supplier as incorrect', () => {
        const dom = createPage({
            mediaCost: '£1,000.00',
            feeSupplier: 'FACEBOOK:Meta Digital Service Charge',
            feeCost: '£20.00'
        });
        const assessment = dom.window.dstAssuranceFeature.assessDstAssurance();

        expect(assessment.status).toBe('incorrect');
        expect(assessment.supplierCorrect).toBe(false);
        expect(assessment.amountCorrect).toBe(true);
        expect(assessment.tooltip).toBe(
            'Check Meta Location Fee is booked to the correct supplier, and not the standard Facebook media supplier'
        );
        dom.window.dstAssuranceFeature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('FACEBOOK:Meta Digital Service Charge'));
        expect(feeRow.children[3].classList).toContain('toolshed-dst-assurance-warning-cell');
        expect(feeRow.children[3].getAttribute('data-toolshed-dst-assurance-warning')).toBe('true');
        expect(feeRow.children[8].classList).not.toContain('toolshed-dst-assurance-warning-cell');
        dom.window.close();
    });

    test('mirrors the supplier highlight onto Prisma fixed-column clones', () => {
        const dom = createPage({
            mediaCost: '£1,000.00',
            feeSupplier: 'FACEBOOK:Meta Digital Service Charge',
            feeCost: '£20.00'
        });
        const feeRow = Array.from(dom.window.document.querySelectorAll('.ht_master .htCore tr'))
            .find(row => row.children[3]?.textContent.includes('FACEBOOK:Meta Digital Service Charge'));
        feeRow.children[3].setAttribute('data-row', '6');
        feeRow.children[3].setAttribute('data-col', '3');

        const clone = dom.window.document.createElement('div');
        clone.className = 'ht_clone_left';
        clone.innerHTML = '<table class="htCore"><tbody>' +
            '<tr><td data-row="6" data-col="3">FACEBOOK:Meta Digital Service Charge</td></tr>' +
            '</tbody></table>';
        dom.window.document.querySelector('#grid-container_hot').appendChild(clone);

        dom.window.dstAssuranceFeature.apply();

        expect(clone.querySelector('td').classList)
            .toContain('toolshed-dst-assurance-warning-cell');
        dom.window.close();
    });

    test('does not remove an existing warning during a repeated reconciliation', () => {
        const dom = createPage({
            mediaCost: '£1,000.00',
            feeSupplier: 'FACEBOOK:Meta Digital Service Charge',
            feeCost: '£20.00'
        });
        const feature = dom.window.dstAssuranceFeature;

        feature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('FACEBOOK:Meta Digital Service Charge'));
        const firstWarningClassName = feeRow.children[3].className;

        feature.apply();

        expect(feeRow.children[3].className).toBe(firstWarningClassName);
        expect(feeRow.children[3].getAttribute('data-toolshed-dst-assurance-warning')).toBe('true');
        dom.window.close();
    });

    test('keeps a warning while Prisma is temporarily rebuilding the fee rows', () => {
        const dom = createPage({
            mediaCost: '£1,000.00',
            feeSupplier: 'FACEBOOK:Meta Digital Service Charge',
            feeCost: '£20.00'
        });
        const feature = dom.window.dstAssuranceFeature;

        feature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('FACEBOOK:Meta Digital Service Charge'));
        feeRow.children[3].classList.remove('group-cell', 'hierarchical-level-group-1');

        expect(feature.assessDstAssurance().dstFeeRows).toHaveLength(0);
        feature.apply();

        expect(feeRow.children[3].classList)
            .toContain('toolshed-dst-assurance-warning-cell');
        expect(feeRow.children[3].getAttribute('data-toolshed-dst-assurance-warning')).toBe('true');
        dom.window.close();
    });

    test('marks a DST with an incorrect amount as incorrect within the canonical grid', () => {
        const dom = createPage({ mediaCost: '£1,000.00', feeCost: '£18.98' });
        const assessment = dom.window.dstAssuranceFeature.assessDstAssurance();

        expect(assessment.status).toBe('incorrect');
        expect(assessment.supplierCorrect).toBe(true);
        expect(assessment.amountCorrect).toBe(false);
        expect(assessment.expectedFee).toBe(20);
        expect(assessment.tooltip).toContain('2% of Facebook media booked');
        dom.window.dstAssuranceFeature.apply();
        const feeRow = Array.from(dom.window.document.querySelectorAll('.htCore tr'))
            .find(row => row.children[3]?.textContent.includes('META DIGITAL SERVICE CHARGE'));
        expect(feeRow.children[3].classList).not.toContain('toolshed-dst-assurance-warning-cell');
        expect(feeRow.children[8].classList).toContain('toolshed-dst-assurance-warning-cell');
        dom.window.close();
    });

    test('does not become eligible when Facebook is not a Display supplier', () => {
        const dom = createPage({ mediaSupplier: 'GOOGLE(Google Media)', mediaCost: '£1,000.00' });

        expect(dom.window.dstAssuranceFeature.assessDstAssurance()).toMatchObject({
            eligible: false,
            status: 'hidden'
        });
        dom.window.close();
    });

    test('keeps a yellow tooltip hoverable across the badge gap and preserves the pinned two-second review window', () => {
        jest.useFakeTimers();
        const dom = createPage({ includeFee: false });
        const feature = dom.window.dstAssuranceFeature;

        try {
            feature.apply();
            feature.apply();

            const badge = dom.window.document.querySelector('.toolshed-dst-assurance');
            expect(badge).not.toBeNull();
            expect(badge.classList).toContain('toolshed-dst-assurance--incorrect');
            expect(badge.textContent).toBe('DST Booked');
            expect(badge.title).toBe('');
            expect(badge.getAttribute('role')).toBe('button');
            expect(badge.getAttribute('tabindex')).toBe('0');
            expect(badge.getAttribute('aria-expanded')).toBe('false');
            expect(dom.window.document.querySelectorAll('.toolshed-dst-assurance')).toHaveLength(1);
            expect(badge.previousElementSibling.classList).toContain('gmi-chat-button');

            const tooltip = dom.window.document.querySelector('.toolshed-dst-assurance-tooltip');
            expect(tooltip).not.toBeNull();
            expect(tooltip.parentElement).toBe(dom.window.document.body);
            expect(tooltip.getAttribute('role')).toBe('tooltip');
            expect(tooltip.textContent).toContain('not been booked');
            expect(badge.hasAttribute('title')).toBe(false);
            expect(badge.getAttribute('aria-describedby')).toBe(tooltip.id);
            expect(tooltip.hidden).toBe(true);

            badge.getBoundingClientRect = () => ({
                left: 100,
                right: 200,
                top: 50,
                bottom: 70,
                width: 100,
                height: 20
            });
            tooltip.getBoundingClientRect = () => ({
                left: 80,
                right: 320,
                top: 78,
                bottom: 120,
                width: 240,
                height: 42
            });

            badge.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
            expect(tooltip.hidden).toBe(false);
            expect(tooltip.style.top).toBe('78px');

            // A user can move from the badge, through the connector gap, and
            // onto the tooltip without losing the explanation immediately.
            badge.dispatchEvent(new dom.window.MouseEvent('mouseleave', {
                bubbles: true,
                clientX: 150,
                clientY: 74
            }));
            expect(tooltip.hidden).toBe(false);
            jest.advanceTimersByTime(400);
            expect(tooltip.hidden).toBe(false);
            tooltip.dispatchEvent(new dom.window.MouseEvent('mouseenter', {
                bubbles: true,
                clientX: 150,
                clientY: 90
            }));
            jest.advanceTimersByTime(1000);
            expect(tooltip.hidden).toBe(false);

            tooltip.dispatchEvent(new dom.window.MouseEvent('mouseleave', {
                bubbles: true,
                clientX: 500,
                clientY: 500
            }));
            jest.advanceTimersByTime(799);
            expect(tooltip.hidden).toBe(false);
            jest.advanceTimersByTime(1);
            expect(tooltip.hidden).toBe(true);
            expect(badge.getAttribute('aria-expanded')).toBe('false');

            badge.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
            badge.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
            expect(badge.getAttribute('aria-expanded')).toBe('true');

            // The pointer is in the eight-pixel connector area, so the pinned
            // tooltip remains visible while moving from the badge to the toast.
            badge.dispatchEvent(new dom.window.MouseEvent('mouseleave', {
                bubbles: true,
                clientX: 150,
                clientY: 74
            }));
            jest.advanceTimersByTime(1000);
            expect(tooltip.hidden).toBe(false);

            tooltip.dispatchEvent(new dom.window.MouseEvent('mouseleave', {
                bubbles: true,
                clientX: 500,
                clientY: 500
            }));
            jest.advanceTimersByTime(1999);
            expect(tooltip.hidden).toBe(false);
            jest.advanceTimersByTime(1);
            expect(tooltip.hidden).toBe(true);
            expect(badge.getAttribute('aria-expanded')).toBe('false');

            const grid = dom.window.document.querySelector('#grid-container_hot');
            grid.remove();
            feature.apply();
            expect(dom.window.document.querySelector('.toolshed-dst-assurance')).toBeNull();
            expect(dom.window.document.querySelector('.toolshed-dst-assurance-tooltip')).toBeNull();
        } finally {
            dom.window.close();
            jest.useRealTimers();
        }
    });

    test('keeps the DST badge row on one visible intrinsic-width line', () => {
        const dom = new JSDOM(`<!doctype html><style>${contentStyles}</style>`);
        const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
        const layoutRule = rules.find(rule =>
            rule.selectorText?.includes('.workflow-widget-wrapper:has(> .toolshed-dst-assurance)')
        );
        const getLayoutValue = property => layoutRule.style.getPropertyValue(property);

        expect({
            display: getLayoutValue('display'),
            alignItems: getLayoutValue('align-items'),
            flexWrap: getLayoutValue('flex-wrap'),
            width: getLayoutValue('width'),
            minWidth: getLayoutValue('min-width'),
            maxWidth: getLayoutValue('max-width'),
            overflow: getLayoutValue('overflow'),
            whiteSpace: getLayoutValue('white-space')
        }).toEqual({
            display: 'inline-flex',
            alignItems: 'center',
            flexWrap: 'nowrap',
            width: 'max-content',
            minWidth: 'max-content',
            maxWidth: 'none',
            overflow: 'visible',
            whiteSpace: 'nowrap'
        });
        dom.window.close();
    });

    test('uses a fixed dark tooltip below the badge instead of the browser title popup', () => {
        const dom = new JSDOM(`<!doctype html><style>${contentStyles}</style>`);
        const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
        const tooltipRule = rules.find(rule =>
            rule.selectorText === '.toolshed-dst-assurance-tooltip'
        );
        const hiddenRule = rules.find(rule =>
            rule.selectorText === '.toolshed-dst-assurance-tooltip[hidden]'
        );
        const getTooltipValue = property => tooltipRule.style.getPropertyValue(property);

        expect({
            position: getTooltipValue('position'),
            zIndex: getTooltipValue('z-index'),
            maxWidth: getTooltipValue('max-width'),
            background: getTooltipValue('background'),
            color: getTooltipValue('color'),
            borderRadius: getTooltipValue('border-radius'),
            whiteSpace: getTooltipValue('white-space'),
            pointerEvents: getTooltipValue('pointer-events')
        }).toEqual({
            position: 'fixed',
            zIndex: '2147483647',
            maxWidth: '360px',
            background: '#1f2937',
            color: '#fff',
            borderRadius: '6px',
            whiteSpace: 'normal',
            pointerEvents: 'auto'
        });
        expect(hiddenRule.style.getPropertyValue('display')).toBe('none');
        dom.window.close();
    });

    test('uses the same pale-yellow background as the incorrect DST badge', () => {
        const dom = new JSDOM(`<!doctype html><style>${contentStyles}</style>`);
        const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
        const badgeRule = rules.find(rule =>
            rule.selectorText === '.toolshed-dst-assurance--incorrect'
        );
        const warningRule = rules.find(rule =>
            rule.selectorText?.includes('.toolshed-dst-assurance-warning-cell') &&
            rule.selectorText.includes('[data-toolshed-dst-assurance-warning]')
        );
        const groupCellOverrideRule = rules.find(rule =>
            rule.selectorText?.includes('#grid-container_hot .htCore td.toolshed-dst-assurance-warning-cell') &&
            rule.selectorText.includes('#grid-container_hot .htCore td[data-toolshed-dst-assurance-warning]')
        );

        expect(warningRule.style.getPropertyValue('background-color'))
            .toBe(badgeRule.style.getPropertyValue('background'));
        expect(warningRule.style.getPropertyValue('background-color')).toBe('#fef3c7');
        expect(warningRule.style.getPropertyValue('box-shadow'))
            .toBe('inset 0 0 0 1px #fcd34d');
        expect(warningRule.style.getPropertyValue('color')).toBe('#111827');
        expect(groupCellOverrideRule.style.getPropertyValue('background'))
            .toBe(badgeRule.style.getPropertyValue('background'));
        expect(groupCellOverrideRule.style.getPropertyValue('background-color')).toBe('#fef3c7');
        dom.window.close();
    });
});
