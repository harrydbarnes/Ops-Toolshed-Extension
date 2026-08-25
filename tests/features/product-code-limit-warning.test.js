const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/product-code-limit-warning.js'),
    'utf8'
);

function attachFeatureSetting(dom, featureEnabled, ignoredProductCodes = []) {
    if (featureEnabled === null && !ignoredProductCodes.length) return;

    const settingListeners = [];
    const localStore = {
        productCodeLimitWarningIgnored: [...ignoredProductCodes]
    };
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((_key, callback) => callback({
                    productCodeLimitWarningEnabled: featureEnabled !== false
                }))
            },
            local: {
                get: jest.fn((_key, callback) => callback(localStore)),
                set: jest.fn((values, callback) => {
                    Object.assign(localStore, values);
                    callback?.();
                })
            },
            onChanged: {
                addListener: listener => settingListeners.push(listener)
            }
        }
    };
    dom.window.setProductCodeLimitWarningEnabled = value => settingListeners.forEach(listener => listener({
        productCodeLimitWarningEnabled: { newValue: value }
    }, 'sync'));
}

function createPage(
    count,
    url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP33QKJ&ptb-mod=buy&ptb-ctx=digital',
    estimateCodes = Array.from({ length: count }, (_, index) => index + 1),
    featureEnabled = null,
    ignoredProductCodes = []
) {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div class="mo-page-header">
            <div class="mo-header-right-section">
                <div class="buy-details-wrapper">
                    <mo-text class="buy-details-background buy-details-full" data-full-text="CP33QKJ | D/CW7/3/83">CP33QKJ | D/CW7/3/83</mo-text>
                    <mo-text class="buy-details-background buy-details-collapsed" data-full-text="CP33QKJ | +1">CP33QKJ | +1</mo-text>
                </div>
            </div>
        </div>
    </body></html>`, {
        url,
        runScripts: 'dangerously'
    });

    dom.window.fetch = jest.fn(urlValue => {
        if (String(urlValue).includes('/campaign-service/secure/campaign/publicforui/')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    agencyId: 2009,
                    campaignBuyDetails: [{
                        agencyMedia: { systemCode: 'P', mediaCode: 'D' },
                        client: { clientCode: 'CW7' },
                        product: { productCode: '3', productShortName: '3' }
                    }]
                })
            });
        }

        return Promise.resolve({
            ok: true,
            json: async () => estimateCodes.map((estimateCode, index) => ({
                estimateCode: String(estimateCode),
                businessKey: `UK|A1|D|CW7  |3|${index + 1}`
            }))
        });
    });

    attachFeatureSetting(dom, featureEnabled, ignoredProductCodes);
    const script = dom.window.document.createElement('script');
    script.textContent = featureScript;
    dom.window.document.head.appendChild(script);
    return dom;
}

function createAddCampaignPage(estimateCodes = [201, 210], featureEnabled = null, ignoredProductCodes = []) {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <iframe id="os-c-34"></iframe>
    </body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&route=campaigns&osModalId=prsm-cm-cmpadd',
        runScripts: 'dangerously'
    });

    const frameDocument = dom.window.document.querySelector('iframe').contentDocument;
    frameDocument.body.innerHTML = `
        <select id="debug-mediaMix-mediaType0"><option value="media_digital" selected>Online</option></select>
        <fieldset class="sectionFinancial">
            <table id="financial-section-table"><tbody data-bind="foreach: buyDetails">
                <tr class="mcpe-row">
                    <td><input id="gwt-debug-bd-mediaType0" value="P_D_media_digital"></td>
                    <td><input id="gwt-debug-bd-client0" value="D-UK|A1|D|B97-B97"><span class="text-secondary">B97</span></td>
                    <td><input id="gwt-debug-bd-product0" value="D-UK|A1|D|B97  |81-81"><span class="select2-chosen">BMG</span><span class="text-secondary">81</span></td>
                    <td>
                        <div class="select2-container" id="s2id_gwt-debug-bd-estimate0"><span class="select2-chosen">Select...</span></div>
                        <input id="gwt-debug-bd-estimate0" disabled>
                    </td>
                    <td><input id="gwt-debug-bd-buyType0"></td>
                </tr>
            </tbody></table>
        </fieldset>`;

    dom.window.fetch = jest.fn(urlValue => {
        if (String(urlValue).includes('/agency-service/secure/user')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ agencyLocation: { agencyId: 2009 } })
            });
        }

        return Promise.resolve({
            ok: true,
            json: async () => estimateCodes.map((estimateCode, index) => ({
                estimateCode: String(estimateCode),
                businessKey: `UK|A1|D|B97  |81|${index + 1}`
            }))
        });
    });

    attachFeatureSetting(dom, featureEnabled, ignoredProductCodes);
    const script = dom.window.document.createElement('script');
    script.textContent = featureScript;
    dom.window.document.head.appendChild(script);
    return dom;
}

describe('Product Code Limit Warning Feature', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test.each([
        [200, null],
        [201, 'yellow'],
        [220, 'yellow'],
        [221, 'orange'],
        [250, 'orange'],
        [251, 'red'],
        [254, 'red']
    ])('uses the requested threshold colour for %i campaigns', async (count, level) => {
        const dom = createPage(count);

        await dom.window.productCodeLimitWarningFeature.initialize();

        const campaignId = dom.window.document.querySelector('.toolshed-product-code-limit-warning-product-campaign');
        if (!level) {
            expect(campaignId).toBeNull();
        } else {
            expect(campaignId).not.toBeNull();
            expect(campaignId.classList).toContain(`toolshed-product-code-limit-warning--${level}`);
        }

        dom.window.close();
    });

    test('uses the highest exposed campaign code rather than the number of returned records', async () => {
        const dom = createPage(2, undefined, [201, 210]);
        const { document } = dom.window;

        await dom.window.productCodeLimitWarningFeature.initialize();

        const campaignId = document.querySelector('.toolshed-product-code-limit-warning-product-campaign');
        const tooltip = document.getElementById(campaignId.getAttribute('aria-describedby'));

        expect(campaignId.classList).toContain('toolshed-product-code-limit-warning--yellow');
        expect(tooltip.textContent).toContain('210 of 254 campaigns');
        expect(tooltip.textContent).not.toContain('2 of 254 campaigns');

        dom.window.close();
    });

    test('shows an accessible hover and focus tooltip with the product-code next step', async () => {
        const dom = createPage(251);
        const { document } = dom.window;
        jest.useFakeTimers();

        try {
            await dom.window.productCodeLimitWarningFeature.initialize();

            const campaignId = document.querySelector('.toolshed-product-code-limit-warning-product-campaign');
            const tooltipId = campaignId.getAttribute('aria-describedby');
            const tooltip = document.getElementById(tooltipId);

            expect(campaignId.textContent).toBe('3/83');
            expect(campaignId.getAttribute('tabindex')).toBe('0');
            expect(tooltip).not.toBeNull();
            expect(tooltip.getAttribute('role')).toBe('tooltip');
            expect(tooltip.hidden).toBe(true);
            expect(tooltip.textContent).toContain('251 of 254 campaigns');
            expect(tooltip.textContent).toMatch(/product code 3/i);
            expect(tooltip.textContent).toContain('EasyVista');
            expect(tooltip.textContent).toContain('planner');
            expect(tooltip.textContent).toContain('Ask your planner to submit an EasyVista form ahead of time');
            expect(tooltip.querySelector('.toolshed-product-code-limit-warning-ignore')).not.toBeNull();

            campaignId.dispatchEvent(new dom.window.Event('mouseenter'));
            expect(tooltip.hidden).toBe(false);

            campaignId.dispatchEvent(new dom.window.Event('mouseleave'));
            expect(tooltip.hidden).toBe(false);

            tooltip.dispatchEvent(new dom.window.Event('mouseenter'));
            tooltip.dispatchEvent(new dom.window.Event('mouseleave'));
            jest.advanceTimersByTime(799);
            expect(tooltip.hidden).toBe(false);
            jest.advanceTimersByTime(1);
            expect(tooltip.hidden).toBe(true);

            campaignId.dispatchEvent(new dom.window.Event('focus'));
            expect(tooltip.hidden).toBe(false);
        } finally {
            jest.useRealTimers();
            dom.window.close();
        }
    });

    test('uses the active campaign metadata to look up the matching client and product', async () => {
        const dom = createPage(201);

        await dom.window.productCodeLimitWarningFeature.initialize();

        expect(dom.window.fetch).toHaveBeenNthCalledWith(
            1,
            '/campaign-service/secure/campaign/publicforui/CP33QKJ',
            expect.objectContaining({ credentials: 'include' })
        );
        const estimateUrl = dom.window.fetch.mock.calls[1][0];
        expect(estimateUrl).toContain('/agency-service/secure/estimate/v2/2009?');
        expect(estimateUrl).toContain('systemCode=P');
        expect(estimateUrl).toContain('mediaCode=D');
        expect(estimateUrl).toContain('clientCode=CW7');
        expect(estimateUrl).toContain('productCode=3');

        dom.window.close();
    });

    test('warns in Add Campaign financial settings using the highest matching campaign code', async () => {
        const dom = createAddCampaignPage([201, 210]);
        const frameDocument = dom.window.document.querySelector('iframe').contentDocument;

        try {
            await dom.window.productCodeLimitWarningFeature.initialize();

            const warning = frameDocument.querySelector('.toolshed-product-code-limit-warning-add-campaign');
            expect(warning).not.toBeNull();
            expect(warning.classList).toContain('toolshed-product-code-limit-warning--yellow');
            expect(warning.textContent).toContain('210 of 254 campaigns');
            expect(warning.textContent).toContain('EasyVista');
            expect(warning.textContent).toContain('planner');
            const frameStyles = frameDocument.getElementById('toolshed-product-code-limit-warning-frame-styles');
            expect(frameStyles).not.toBeNull();

            const tooltip = frameDocument.getElementById(warning.getAttribute('aria-describedby'));
            expect(tooltip).not.toBeNull();
            expect(tooltip.getAttribute('role')).toBe('tooltip');
            expect(tooltip.hidden).toBe(true);
            const ignoreButton = tooltip.querySelector('.toolshed-product-code-limit-warning-ignore');
            const ignoreButtonStyle = frameDocument.defaultView.getComputedStyle(ignoreButton);
            expect(ignoreButtonStyle.marginTop).toBe('4px');
            expect(ignoreButtonStyle.paddingTop).toBe('3px');
            expect(ignoreButtonStyle.fontSize).toBe('12px');
            warning.dispatchEvent(new frameDocument.defaultView.Event('mouseenter'));
            expect(tooltip.hidden).toBe(false);

            expect(dom.window.fetch).toHaveBeenNthCalledWith(
                1,
                '/agency-service/secure/user',
                expect.objectContaining({ credentials: 'include' })
            );
            const estimateUrl = dom.window.fetch.mock.calls[1][0];
            expect(estimateUrl).toContain('/agency-service/secure/estimate/v2/2009?');
            expect(estimateUrl).toContain('clientCode=B97');
            expect(estimateUrl).toContain('productCode=81');
        } finally {
            dom.window.close();
        }
    });

    test('honors the Settings toggle for active and Add Campaign warnings', async () => {
        const activeDom = createPage(251, undefined, undefined, false);
        try {
            await activeDom.window.productCodeLimitWarningFeature.initialize();

            expect(activeDom.window.fetch).not.toHaveBeenCalled();
        expect(activeDom.window.document.querySelector('.toolshed-product-code-limit-warning-product-campaign'))
                .toBeNull();

            activeDom.window.setProductCodeLimitWarningEnabled(true);
            await activeDom.window.productCodeLimitWarningFeature.refresh();
            expect(activeDom.window.document.querySelector('.toolshed-product-code-limit-warning-product-campaign'))
                .not.toBeNull();
        } finally {
            activeDom.window.close();
        }

        const addDom = createAddCampaignPage([251], false);
        try {
            await addDom.window.productCodeLimitWarningFeature.initialize();

            expect(addDom.window.fetch).not.toHaveBeenCalled();
            expect(addDom.window.document.querySelector('iframe').contentDocument
                .querySelector('.toolshed-product-code-limit-warning-add-campaign')).toBeNull();
        } finally {
            addDom.window.close();
        }
    });

    test('removes the warning after SPA navigation away from the active campaign', async () => {
        const dom = createPage(251);
        const { window } = dom;

        await window.productCodeLimitWarningFeature.initialize();
        expect(window.document.querySelector('.toolshed-product-code-limit-warning-product-campaign')).not.toBeNull();

        window.history.replaceState({}, '', '#osPspId=cm-dashboard&route=campaigns');
        window.dispatchEvent(new window.Event('popstate'));
        await window.productCodeLimitWarningFeature.refresh();

        expect(window.document.querySelector('.toolshed-product-code-limit-warning-product-campaign')).toBeNull();
        expect(window.document.querySelector('[role="tooltip"]')).toBeNull();

        window.close();
    });

    test('lets the user ignore the matching product code and persists that choice', async () => {
        const dom = createPage(251, undefined, undefined, true);
        try {
            await dom.window.productCodeLimitWarningFeature.initialize();

            const badge = dom.window.document
                .querySelector('.toolshed-product-code-limit-warning-product-campaign');
            const tooltip = dom.window.document.getElementById(badge.getAttribute('aria-describedby'));
            const ignoreButton = tooltip.querySelector('.toolshed-product-code-limit-warning-ignore');

            ignoreButton.click();
            await dom.window.productCodeLimitWarningFeature.refresh();

            expect(dom.window.document
                .querySelector('.toolshed-product-code-limit-warning-product-campaign')).toBeNull();
            expect(dom.window.chrome.storage.local.set).toHaveBeenCalledWith(
                { productCodeLimitWarningIgnored: ['d|cw7|3'] },
                expect.any(Function)
            );
        } finally {
            dom.window.close();
        }

        const ignoredDom = createPage(251, undefined, undefined, true, ['d|cw7|3']);
        try {
            await ignoredDom.window.productCodeLimitWarningFeature.initialize();

            expect(ignoredDom.window.fetch).not.toHaveBeenCalled();
            expect(ignoredDom.window.document
                .querySelector('.toolshed-product-code-limit-warning-product-campaign')).toBeNull();
        } finally {
            ignoredDom.window.close();
        }
    });

    test('restores a previously ignored warning when the reset action is requested', async () => {
        const dom = createPage(251, undefined, undefined, true, ['d|cw7|3']);
        try {
            await dom.window.productCodeLimitWarningFeature.initialize();

            expect(dom.window.document
                .querySelector('.toolshed-product-code-limit-warning-product-campaign')).toBeNull();

            await dom.window.productCodeLimitWarningFeature.resetIgnoredProductCodes();

            const restoredWarning = dom.window.document
                .querySelector('.toolshed-product-code-limit-warning-product-campaign');
            expect(restoredWarning).not.toBeNull();
            expect(restoredWarning.classList).toContain('toolshed-product-code-limit-warning--red');
        } finally {
            dom.window.close();
        }
    });
});
