const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repoRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const liveChatScript = fs.readFileSync(
    path.join(repoRoot, 'features/live-chat-enhancements.js'),
    'utf8'
);

function registrationBytes(registration, field) {
    return (registration?.[field] || []).reduce(
        (total, relativePath) => total + fs.statSync(path.join(repoRoot, relativePath)).size,
        0
    );
}

const fullRegistration = manifest.content_scripts.find(entry => entry.js?.includes('content.js'));
const childFrameRegistrations = manifest.content_scripts.filter(entry => entry.all_frames === true);

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
});
const { window } = dom;
const { document } = window;

for (let index = 0; index < 2000; index += 1) {
    const element = document.createElement('div');
    element.className = `unrelated group-${index % 25}`;
    document.body.appendChild(element);
}
for (let hostIndex = 0; hostIndex < 20; hostIndex += 1) {
    const host = document.createElement('unrelated-host');
    const root = host.attachShadow({ mode: 'open' });
    for (let childIndex = 0; childIndex < 10; childIndex += 1) {
        root.appendChild(document.createElement('span'));
    }
    document.body.appendChild(host);
}

const banner = document.createElement('mo-banner');
const bannerRoot = banner.attachShadow({ mode: 'open' });
const helpMenu = document.createElement('mo-banner-help-menu');
const helpRoot = helpMenu.attachShadow({ mode: 'open' });
const menu = document.createElement('mo-menu');
const menuRoot = menu.attachShadow({ mode: 'open' });
const aiChat = document.createElement('button');
aiChat.textContent = 'AI Chat';
menuRoot.appendChild(aiChat);
helpRoot.appendChild(menu);
bannerRoot.appendChild(helpMenu);
document.body.appendChild(banner);

window.chrome = {
    storage: {
        sync: {
            get: (defaults, callback) => callback({ ...defaults, directMoeChatEnabled: true })
        },
        onChanged: { addListener: () => {} }
    }
};

let observerCallback = null;
let observedRoots = 0;
window.MutationObserver = class {
    constructor(callback) {
        observerCallback = callback;
    }
    observe() {
        observedRoots += 1;
    }
    disconnect() {}
};

let universalSelectorCalls = 0;
let universalCandidates = 0;
for (const prototype of [
    window.Document.prototype,
    window.Element.prototype,
    window.ShadowRoot.prototype
]) {
    const nativeQuerySelectorAll = prototype.querySelectorAll;
    prototype.querySelectorAll = function(selector) {
        const result = nativeQuerySelectorAll.call(this, selector);
        if (selector === '*') {
            universalSelectorCalls += 1;
            universalCandidates += result.length;
        }
        return result;
    };
}

window.eval(liveChatScript);
window.liveChatEnhancements.initialize();
const initialization = { universalSelectorCalls, universalCandidates, observedRoots };

universalSelectorCalls = 0;
universalCandidates = 0;
const unrelatedSubtree = document.createElement('section');
for (let index = 0; index < 100; index += 1) {
    unrelatedSubtree.appendChild(document.createElement('div'));
}
observerCallback?.([{
    target: document.body,
    addedNodes: [unrelatedSubtree]
}]);
const unrelatedMutation = { universalSelectorCalls, universalCandidates };

const frameSpecificRegistrations = childFrameRegistrations.map(registration => ({
    matches: registration.matches,
    scripts: registration.js?.length || 0,
    jsBytes: registrationBytes(registration, 'js'),
    cssBytes: registrationBytes(registration, 'css')
}));

console.log(JSON.stringify({
    frameInjection: {
        fullBundleAllFrames: fullRegistration?.all_frames === true,
        fullBundleScripts: fullRegistration?.js?.length || 0,
        fullBundleJsBytes: registrationBytes(fullRegistration, 'js'),
        fullBundleCssBytes: registrationBytes(fullRegistration, 'css'),
        frameSpecificRegistrations
    },
    directMoe: {
        initialization,
        unrelatedMutation
    }
}, null, 2));

dom.window.close();
