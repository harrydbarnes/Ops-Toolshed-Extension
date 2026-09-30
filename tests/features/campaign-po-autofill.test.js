const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.resolve(__dirname, '../../features/campaign-po-autofill.js'), 'utf8');
const stateSource = fs.readFileSync(path.resolve(__dirname, '../../features/extension-state-controller.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('campaign PO reference autofill', () => {
    let dom, document, listeners;
    function setup({ enabled = true, disabled = false, modal = 'prsm-cm-cmpadd', markup = '' } = {}) {
        dom = new JSDOM(`<body><div id="financial-section-body">${markup}
            <input id="gwt-debug-financialRefId0"><input id="campaign-client-reference"></div></body>`, {
            url: `https://go.mediaocean.com/idesk/prisma-campaign-details/index.html?osModalId=${modal}`,
            runScripts: 'dangerously'
        });
        document = dom.window.document;
        listeners = [];
        dom.window.chrome = {
            runtime: {},
            storage: {
                sync: { get: (defaults, callback) => callback({ ...defaults, campaignPoAutofillEnabled: enabled, allFeaturesDisabled: disabled }) },
                onChanged: { addListener: listener => listeners.push(listener) }
            }
        };
        dom.window.eval(stateSource);
        dom.window.eval(source);
    }
    const po = labels => `<div id="s2id_gwt-debug-bd-purchaseOrder0"><ul>${labels.map(label =>
        `<li class="select2-search-choice"><div><span>${label}</span></div><a>×</a></li>`).join('')}
        <li class="select2-search-field"><input value="Search text"></li></ul></div>`;
    function change(key, value) {
        listeners.forEach(listener => listener({ [key]: { newValue: value } }, 'sync'));
    }
    afterEach(() => dom?.window.close());

    test('handles a PO field appearing later and notifies Prisma through input and change', async () => {
        setup();
        const input = document.getElementById('gwt-debug-financialRefId0');
        const onInput = jest.fn();
        const onChange = jest.fn();
        input.addEventListener('input', onInput);
        input.addEventListener('change', onChange);
        document.getElementById('financial-section-body').insertAdjacentHTML('afterbegin', po(['7000197809: Black Friday - 21/11/2025 - 30/09/2026']));
        await flush();
        expect(input.value).toBe('7000197809');
        expect(document.getElementById('campaign-client-reference').value).toBe('7000197809');
        expect(onInput).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledTimes(1);
        dom.window.campaignPoAutofillFeature.apply();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    test('deduplicates PO line items, updates owned values, preserves manual text, and clears removed selections', async () => {
        setup({ markup: po(['PO-123: First line', 'PO-123: Second line']) });
        await flush();
        const reference = document.getElementById('gwt-debug-financialRefId0');
        const client = document.getElementById('campaign-client-reference');
        expect(reference.value).toBe('PO-123');
        client.value = 'Manual reference';
        document.querySelector('#s2id_gwt-debug-bd-purchaseOrder0 ul').insertAdjacentHTML('beforeend', '<li class="select2-search-choice"><div>PO-456: Other line</div></li>');
        await flush();
        expect(reference.value).toBe('PO-123; PO-456');
        expect(client.value).toBe('Manual reference');
        document.getElementById('s2id_gwt-debug-bd-purchaseOrder0').remove();
        await flush();
        expect(reference.value).toBe('');
        expect(client.value).toBe('Manual reference');
    });

    test.each([
        { enabled: false }, { disabled: true }, { modal: 'prsm-cm-cmpedit' }, { modal: 'prsm-cm-cmpcopy' }
    ])('does not autofill outside enabled new campaign setup: %j', async options => {
        setup({ ...options, markup: po(['123: Line']) });
        await flush();
        expect(document.getElementById('campaign-client-reference').value).toBe('');
    });

    test('feature setting and master kill switch stop queued work and reenable correctly', async () => {
        setup();
        document.getElementById('financial-section-body').insertAdjacentHTML('afterbegin', po(['123: Line']));
        change('allFeaturesDisabled', true);
        await flush();
        expect(document.getElementById('campaign-client-reference').value).toBe('');
        change('allFeaturesDisabled', false);
        expect(document.getElementById('campaign-client-reference').value).toBe('123');
        change('campaignPoAutofillEnabled', false);
        document.querySelector('.select2-search-choice span').textContent = '456: New line';
        await flush();
        expect(document.getElementById('campaign-client-reference').value).toBe('123');
        change('campaignPoAutofillEnabled', true);
        expect(document.getElementById('campaign-client-reference').value).toBe('456');
    });

    test('preserves nonempty and readonly fields and ignores hidden PO rows', async () => {
        setup();
        const reference = document.getElementById('gwt-debug-financialRefId0');
        const client = document.getElementById('campaign-client-reference');
        reference.value = 'Existing';
        client.readOnly = true;
        document.getElementById('financial-section-body').insertAdjacentHTML('afterbegin', po(['123: Line']));
        await flush();
        expect(reference.value).toBe('Existing');
        expect(client.value).toBe('');
        client.readOnly = false;
        document.getElementById('s2id_gwt-debug-bd-purchaseOrder0').hidden = true;
        await flush();
        expect(client.value).toBe('');
    });
});
