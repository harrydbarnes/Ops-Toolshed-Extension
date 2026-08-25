const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign-add-sections.js'),
    'utf8'
);

const addCampaignUrl = 'https://groupmuk-prisma.mediaocean.com/idesk/prisma-campaign-details/index.html?osModalId=prsm-cm-cmpadd';

function setup({ enabled = true, body = '' } = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
        url: addCampaignUrl,
        runScripts: 'dangerously'
    });
    const storageListeners = [];
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((_keys, callback) => callback({ hidingSectionsEnabled: enabled }))
            },
            onChanged: {
                addListener: jest.fn(listener => storageListeners.push(listener))
            }
        }
    };
    dom.window.eval(featureScript);
    return { dom, storageListeners };
}

const formMarkup = `
    <fieldset class="sectionObjective"><legend>Objective</legend><select id="gwt-debug-strategy"></select></fieldset>
    <fieldset class="sectionTargeting"><legend>Targeting</legend><input id="debug-targeting-target0"></fieldset>
    <div class="row-fluid"><div class="control-group"><select id="gwt-debug-distribution"></select></div></div>
`;

describe('Add Campaign section hiding', () => {
    test('hides Objective, Targeting, and Flighting in the Add Campaign frame', () => {
        const { dom } = setup({ body: formMarkup });

        dom.window.campaignAddSectionsFeature.apply();

        expect(dom.window.document.querySelector('fieldset.sectionObjective').style.display).toBe('none');
        expect(dom.window.document.querySelector('fieldset.sectionTargeting').style.display).toBe('none');
        expect(dom.window.document.querySelector('#gwt-debug-distribution').parentElement.parentElement.style.display).toBe('none');
        dom.window.close();
    });

    test('restores hidden sections when the setting is turned off', () => {
        const { dom, storageListeners } = setup({ body: formMarkup });
        dom.window.campaignAddSectionsFeature.apply();

        storageListeners[0]({
            hidingSectionsEnabled: { oldValue: true, newValue: false }
        }, 'sync');

        expect(dom.window.document.querySelector('fieldset.sectionObjective').style.display).toBe('');
        expect(dom.window.document.querySelector('fieldset.sectionTargeting').style.display).toBe('');
        expect(dom.window.document.querySelector('#gwt-debug-distribution').parentElement.parentElement.style.display).toBe('');
        dom.window.close();
    });

    test('hides sections added after the frame initially loads', async () => {
        const { dom } = setup();
        dom.window.campaignAddSectionsFeature.apply();
        dom.window.document.body.insertAdjacentHTML('beforeend', formMarkup);

        await new Promise(resolve => dom.window.setTimeout(resolve, 25));

        expect(dom.window.document.querySelector('fieldset.sectionObjective').style.display).toBe('none');
        expect(dom.window.document.querySelector('fieldset.sectionTargeting').style.display).toBe('none');
        dom.window.close();
    });
});
