const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { JSDOM } = require('jsdom');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../features/actualise-scroll-restore.js'),
    'utf8'
);

function makeScrollable(element, scrollLeft = 0) {
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 1600 });
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: 500 });
    element.scrollLeft = scrollLeft;
    return element;
}

const unrelatedMarkup = Array.from(
    { length: 5000 },
    (_, index) => `<div class="unrelated-node group-${index % 20}"></div>`
).join('');
const dom = new JSDOM(`<!doctype html><html><body>
    ${unrelatedMarkup}
    <div id="grid-container_hot">
        <div class="handsontable">
            <div class="wtHolder"></div>
            <div class="wtHolder"></div>
        </div>
    </div>
</body></html>`, {
    url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-ctx=actualize&route=actualize',
    runScripts: 'dangerously'
});
const { window } = dom;
const { document } = window;
window.chrome = {
    storage: {
        sync: {
            get: (_keys, callback) => callback({ actualiseScrollRestoreEnabled: true })
        },
        onChanged: { addListener: () => {} }
    }
};
window.setTimeout = () => 0;

let selectorCalls = 0;
let selectedCandidates = 0;
let universalSelectorCalls = 0;
const nativeQuerySelectorAll = document.querySelectorAll.bind(document);
document.querySelectorAll = selector => {
    const result = nativeQuerySelectorAll(selector);
    selectorCalls += 1;
    selectedCandidates += result.length;
    if (selector === '*') universalSelectorCalls += 1;
    return result;
};

window.eval(featureScript);
const [master, headerClone] = Array.from(document.querySelectorAll('.wtHolder'));
makeScrollable(master, 640);
makeScrollable(headerClone, 640);
window.actualiseScrollRestoreFeature.initialize();
master.dispatchEvent(new window.Event('scroll'));
window.actualiseScrollRestoreFeature.captureBeforeAction();
master.scrollLeft = 0;
headerClone.scrollLeft = 0;

selectorCalls = 0;
selectedCandidates = 0;
universalSelectorCalls = 0;
const iterations = 200;
const startedAt = performance.now();
for (let index = 0; index < iterations; index += 1) {
    window.actualiseScrollRestoreFeature.restoreScrollPosition();
}
const elapsedMs = performance.now() - startedAt;

console.log(JSON.stringify({
    iterations,
    pageElements: document.getElementsByTagName('*').length,
    selectorCalls,
    universalSelectorCalls,
    selectedCandidates,
    restoredScrollLeft: master.scrollLeft,
    elapsedMs: Number(elapsedMs.toFixed(2))
}, null, 2));

dom.window.close();
