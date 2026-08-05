const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const utilsCode = fs.readFileSync(path.resolve(__dirname, '../../utils.js'), 'utf8');
const monitorCode = fs.readFileSync(path.resolve(__dirname, '../../features/loading-monitor.js'), 'utf8');

describe('shared Prisma loading monitor', () => {
    function makeVisible(element) {
        element.getBoundingClientRect = () => ({
            left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40
        });
        return element;
    }

    test('indexes page and side-panel spinners, including Shadow DOM, once for all consumers', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        window.requestAnimationFrame = callback => callback();

        const pageSpinner = makeVisible(window.document.createElement('mo-spinner'));
        const sidePanel = window.document.createElement('mo-side-panel');
        const sidePanelShadow = sidePanel.attachShadow({ mode: 'open' });
        const sideSpinner = makeVisible(window.document.createElement('svg'));
        sideSpinner.classList.add('spinner');
        sidePanelShadow.appendChild(sideSpinner);
        window.document.body.append(pageSpinner, sidePanel);

        window.eval(utilsCode);
        window.eval(monitorCode);
        const initial = window.loadingMonitor.refreshNow();

        expect(initial.visibleSpinners).toEqual([pageSpinner, sideSpinner]);
        expect(initial.pageVisibleSpinners).toEqual([pageSpinner]);
        expect(initial.sidePanelVisibleSpinners).toEqual([sideSpinner]);

        const replacement = makeVisible(window.document.createElement('div'));
        replacement.className = 'mo-spinner';
        pageSpinner.replaceWith(replacement);
        await Promise.resolve();
        const replaced = window.loadingMonitor.refreshNow();

        expect(replaced.visibleSpinners).toEqual([sideSpinner, replacement]);
        expect(replaced.pageVisibleSpinners).toEqual([replacement]);
        dom.window.close();
    });

    test('notifies subscribers only when the visible spinner allocation changes', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        window.requestAnimationFrame = callback => callback();
        window.eval(utilsCode);
        window.eval(monitorCode);

        const listener = jest.fn();
        window.loadingMonitor.subscribe(listener);
        const spinner = makeVisible(window.document.createElement('mo-spinner'));
        window.document.body.appendChild(spinner);
        await Promise.resolve();
        window.loadingMonitor.refreshNow();
        window.document.body.appendChild(window.document.createElement('div'));
        await Promise.resolve();
        window.loadingMonitor.refreshNow();

        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener.mock.calls[1][0].visibleSpinners).toEqual([spinner]);
        dom.window.close();
    });

    test('indexes an existing element when a class change turns it into a spinner', async () => {
        const dom = new JSDOM('<!doctype html><html><body><div id="candidate"></div></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        window.requestAnimationFrame = callback => callback();
        window.eval(utilsCode);
        window.eval(monitorCode);

        const candidate = makeVisible(window.document.getElementById('candidate'));
        window.loadingMonitor.initialize();
        candidate.className = 'mo-spinner';
        await Promise.resolve();
        const state = window.loadingMonitor.refreshNow();

        expect(state.visibleSpinners).toEqual([candidate]);
        dom.window.close();
    });

    test('allocates approver workflow spinners to the side-panel bucket', () => {
        const dom = new JSDOM('<!doctype html><html><body><div class="workflow-widget-wrapper"><mo-spinner></mo-spinner></div></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        window.requestAnimationFrame = callback => callback();
        window.eval(utilsCode);
        window.eval(monitorCode);
        const spinner = window.document.querySelector('mo-spinner');
        spinner.getBoundingClientRect = () => ({ left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 });

        const state = window.loadingMonitor.refreshNow();

        expect(state.pageVisibleSpinners).toEqual([]);
        expect(state.sidePanelVisibleSpinners).toEqual([spinner]);
        dom.window.close();
    });

    test('allocates the live workflow panel busy icon to the side-panel bucket', () => {
        const dom = new JSDOM('<!doctype html><html><body><div id="workflowWidgetContainer"><div class="mo-workflow-panel"><div class="mo-side-panel"><div id="vp-block"><i id="vp-busy-icon" class="fa fa-circle-o-notch fa-spin"></i></div></div></div></div></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        window.requestAnimationFrame = callback => callback();
        window.eval(utilsCode);
        window.eval(monitorCode);
        const spinner = window.document.getElementById('vp-busy-icon');
        spinner.getBoundingClientRect = () => ({ left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 });

        const state = window.loadingMonitor.refreshNow();

        expect(state.pageVisibleSpinners).toEqual([]);
        expect(state.sidePanelVisibleSpinners).toEqual([spinner]);
        dom.window.close();
    });
});
