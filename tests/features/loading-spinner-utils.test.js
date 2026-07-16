const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const utilsCode = fs.readFileSync(path.resolve(__dirname, '../../utils.js'), 'utf8');

describe('shared loading spinner detection', () => {
    test('returns null when a Shadow DOM search is given no root', () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
        dom.window.eval(utilsCode);

        expect(dom.window.utils.queryShadowDom('svg', null)).toBeNull();
        expect(dom.window.utils.queryAllShadowDom('svg', null)).toEqual([]);
        dom.window.close();
    });

    test('finds visible Prisma spinner variants across light and shadow DOM', () => {
        const dom = new JSDOM('<!doctype html><html><body><div id="vp-block"><i class="fa fa-circle-o-notch fa-spin"></i></div><mo-spinner></mo-spinner><div id="shadow-host"></div></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/'
        });
        const { window } = dom;
        const campaignSpinner = window.document.querySelector('i.fa-spin');
        const hiddenSpinner = window.document.querySelector('mo-spinner');
        hiddenSpinner.style.display = 'none';
        const shadow = window.document.getElementById('shadow-host').attachShadow({ mode: 'open' });
        // jsdom does not class-match namespaced SVG nodes inside ShadowRoot, so use
        // an HTML-created SVG fixture while retaining the production selector.
        const shadowSpinner = window.document.createElement('svg');
        shadowSpinner.classList.add('spinner');
        shadow.appendChild(shadowSpinner);

        [campaignSpinner, hiddenSpinner, shadowSpinner].forEach(element => {
            element.getBoundingClientRect = () => ({ width: 40, height: 40, left: 0, top: 0, right: 40, bottom: 40 });
        });

        window.eval(utilsCode);
        const spinners = window.utils.findVisibleLoadingSpinners();

        expect(spinners).toContain(campaignSpinner);
        expect(spinners).toContain(shadowSpinner);
        expect(spinners).not.toContain(hiddenSpinner);
        dom.window.close();
    });

    test('ignores a spinner hidden by an ancestor', () => {
        const dom = new JSDOM('<!doctype html><html><body><div style="opacity: 0"><mo-spinner></mo-spinner></div></body></html>', {
            runScripts: 'dangerously'
        });
        const spinner = dom.window.document.querySelector('mo-spinner');
        spinner.getBoundingClientRect = () => ({ width: 40, height: 40, left: 0, top: 0, right: 40, bottom: 40 });

        dom.window.eval(utilsCode);

        expect(dom.window.utils.findVisibleLoadingSpinners()).not.toContain(spinner);
        dom.window.close();
    });
});
