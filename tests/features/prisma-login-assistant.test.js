const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/prisma-login-assistant.js'),
    'utf8'
);

const ORGANISATION = 'WPP Media UK Agency Owner United Kingdom';

function createPage({
    stage = 'username',
    enabled = false,
    email = '',
    visible = true,
    focused = true,
    promptStartedAt = 0,
    promptDismissed = false
} = {}) {
    const body = stage === 'username'
        ? `<main><p>Enter username to continue</p><label>Username <input id="username" type="email" name="username"></label><label><input id="remember" type="checkbox" name="rememberMe"> Remember me</label><button type="button">Next</button></main>`
        : `<main><p>Select your organisation to sign in</p><select id="organisation"><option value="">Select</option><option value="wpp">${ORGANISATION}</option></select><button type="button">Submit</button></main>`;
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
        url: 'https://go.mediaocean.com/campaign-management/',
        runScripts: 'dangerously'
    });
    const { window } = dom;
    const syncStore = { prismaLoginAssistantEnabled: enabled };
    const localStore = {
        prismaLoginAssistantEnabledLocal: enabled ? true : null,
        prismaLoginAssistantEmail: email,
        prismaLoginAssistantOrganisation: ORGANISATION,
        prismaLoginAssistantPromptStartedAt: promptStartedAt,
        prismaLoginAssistantPromptDismissed: promptDismissed
    };
    Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
    window.document.hasFocus = jest.fn(() => focused);
    window.chrome = {
        storage: {
            sync: {
                get: jest.fn(defaults => Promise.resolve({ ...defaults, ...syncStore })),
                set: jest.fn(values => {
                    Object.assign(syncStore, values);
                    return Promise.resolve();
                })
            },
            local: {
                get: jest.fn(defaults => Promise.resolve({ ...defaults, ...localStore })),
                set: jest.fn(values => {
                    Object.assign(localStore, values);
                    return Promise.resolve();
                })
            },
            onChanged: { addListener: jest.fn() }
        }
    };
    window.opsToolshedExtensionState = { subscribe: listener => listener(true) };
    window.eval(featureCode);
    return { dom, window, localStore, syncStore };
}

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();
}

function closePage(dom) {
    dom.window.prismaLoginAssistantFeature.dispose();
    dom.window.close();
}

describe('Prisma sign-in assistant', () => {
    test('shows the two-day sign-in prompt without filling or submitting while disabled', async () => {
        const { dom, window } = createPage();
        await settle();

        expect(window.document.getElementById('ops-toolshed-prisma-login-toast').textContent)
            .toContain("tick 'Remember me', then click 'Next'");
        expect(window.document.querySelector('#ops-toolshed-prisma-login-toast button').textContent).toBe('Yes');
        expect(window.document.getElementById('username').value).toBe('');
        closePage(dom);
    });

    test('enables the assistant for a later sign-in when the prompt is accepted', async () => {
        const { dom, window, localStore, syncStore } = createPage();
        await settle();
        const username = window.document.getElementById('username');
        username.value = 'person@example.com';
        window.document.querySelector('#ops-toolshed-prisma-login-toast button').click();

        expect(syncStore.prismaLoginAssistantEnabled).toBe(true);
        expect(localStore.prismaLoginAssistantEnabledLocal).toBe(true);
        expect(localStore.prismaLoginAssistantEmail).toBe('person@example.com');
        expect(window.document.getElementById('ops-toolshed-prisma-login-toast')).toBeNull();
        expect(window.document.getElementById('username').value).toBe('person@example.com');
        closePage(dom);
    });

    test('dismisses the prompt permanently and points users to Settings', async () => {
        const { dom, window, localStore } = createPage();
        await settle();
        window.document.querySelector('.ops-toolshed-login-dismiss').click();

        expect(localStore.prismaLoginAssistantPromptDismissed).toBe(true);
        expect(window.document.getElementById('ops-toolshed-prisma-login-toast').textContent)
            .toContain('at any time in Settings');
        closePage(dom);
    });

    test('stops showing the prompt after two days', async () => {
        const { dom, window } = createPage({ promptStartedAt: Date.now() - (3 * 24 * 60 * 60 * 1000) });
        await settle();

        expect(window.document.getElementById('ops-toolshed-prisma-login-toast')).toBeNull();
        closePage(dom);
    });

    test('fills the email, selects Remember me, and clicks Next only on the focused tab', async () => {
        const { dom, window } = createPage({ enabled: true, email: 'person@example.com' });
        const next = window.document.querySelector('button');
        const nextClick = jest.fn();
        next.addEventListener('click', nextClick);
        await settle();

        expect(window.document.getElementById('username').value).toBe('person@example.com');
        expect(window.document.getElementById('remember').checked).toBe(true);
        expect(nextClick).toHaveBeenCalledTimes(1);
        closePage(dom);
    });

    test('does nothing to a background sign-in tab', async () => {
        const { dom, window } = createPage({ enabled: true, email: 'person@example.com', visible: false, focused: false });
        const next = window.document.querySelector('button');
        const nextClick = jest.fn();
        next.addEventListener('click', nextClick);
        await settle();

        expect(window.document.getElementById('username').value).toBe('');
        expect(window.document.getElementById('remember').checked).toBe(false);
        expect(nextClick).not.toHaveBeenCalled();
        expect(window.document.getElementById('ops-toolshed-prisma-login-toast')).toBeNull();
        closePage(dom);
    });

    test('selects the configured organisation and submits on the organisation page', async () => {
        const { dom, window } = createPage({ stage: 'organisation', enabled: true });
        const submit = window.document.querySelector('button');
        const submitClick = jest.fn();
        submit.addEventListener('click', submitClick);
        await settle();

        expect(window.document.getElementById('organisation').value).toBe('wpp');
        expect(submitClick).toHaveBeenCalledTimes(1);
        closePage(dom);
    });

    test('remembers a manually entered email for the next focused sign-in', async () => {
        const { dom, window, localStore } = createPage({ enabled: true });
        await settle();
        const username = window.document.getElementById('username');
        username.value = 'person@example.com';
        username.dispatchEvent(new window.Event('input', { bubbles: true }));

        expect(localStore.prismaLoginAssistantEmail).toBe('person@example.com');
        closePage(dom);
    });
});
