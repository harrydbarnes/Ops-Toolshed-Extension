const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(
    path.resolve(__dirname, '../../features/live-chat-enhancements.js'),
    'utf8'
);

function setup({ directMoeChatEnabled = true } = {}) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        runScripts: 'outside-only',
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
    });
    const listeners = [];
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((defaults, callback) => callback({ ...defaults, directMoeChatEnabled }))
            },
            onChanged: {
                addListener: jest.fn(listener => listeners.push(listener))
            }
        }
    };

    const banner = dom.window.document.createElement('mo-banner');
    const bannerShadow = banner.attachShadow({ mode: 'open' });
    const helpMenu = dom.window.document.createElement('mo-banner-help-menu');
    const helpShadow = helpMenu.attachShadow({ mode: 'open' });
    const nativeMenu = dom.window.document.createElement('mo-menu');
    nativeMenu.setAttribute('aria-expanded', 'false');
    const menuShadow = nativeMenu.attachShadow({ mode: 'open' });
    const aiChat = dom.window.document.createElement('button');
    aiChat.textContent = 'AI Chat';
    menuShadow.appendChild(aiChat);
    helpShadow.appendChild(nativeMenu);
    bannerShadow.appendChild(helpMenu);
    dom.window.document.body.appendChild(banner);

    const connectItem = dom.window.document.createElement('mo-menu-item');
    connectItem.id = 'Connect with Moe';
    connectItem.textContent = 'Connect with Moe';
    dom.window.document.body.appendChild(connectItem);

    dom.window.eval(script);
    return { dom, listeners, aiChat, nativeMenu, menuShadow, connectItem };
}

describe('Live chat enhancements', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('AI Chat opens the native help menu, chooses Connect with Moe and suppresses the intro', () => {
        const { dom, aiChat, nativeMenu, connectItem } = setup();
        const nativeAiAction = jest.fn();
        const openMenu = jest.fn(() => nativeMenu.setAttribute('aria-expanded', 'true'));
        const connect = jest.fn();
        aiChat.addEventListener('click', nativeAiAction);
        nativeMenu.addEventListener('click', openMenu);
        connectItem.addEventListener('click', connect);

        const intro = dom.window.document.createElement('div');
        intro.id = 'pendo-base';
        intro.textContent = 'Moe, your AI-powered support assistant. Select Connect with Moe to start chatting.';
        dom.window.document.body.appendChild(intro);

        dom.window.liveChatEnhancements.initialize();
        aiChat.click();

        expect(nativeAiAction).not.toHaveBeenCalled();
        expect(openMenu).toHaveBeenCalledTimes(1);
        expect(connect).toHaveBeenCalledTimes(1);
        expect(dom.window.document.getElementById('pendo-base')).toBeNull();
        expect(dom.window.document.body.classList).toContain('toolshed-opening-moe');
        jest.advanceTimersByTime(500);
        expect(dom.window.document.body.classList).not.toContain('toolshed-opening-moe');
        dom.window.close();
    });

    test('leaves the native AI Chat action untouched when direct Moe chat is disabled', () => {
        const { dom, aiChat, connectItem } = setup({ directMoeChatEnabled: false });
        const nativeAiAction = jest.fn();
        const connect = jest.fn();
        aiChat.addEventListener('click', nativeAiAction);
        connectItem.addEventListener('click', connect);

        dom.window.liveChatEnhancements.initialize();
        aiChat.click();

        expect(nativeAiAction).toHaveBeenCalledTimes(1);
        expect(connect).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('rebinds when Prisma replaces AI Chat inside its shadow DOM', async () => {
        const { dom, aiChat, menuShadow, connectItem } = setup();
        const connect = jest.fn();
        connectItem.addEventListener('click', connect);
        dom.window.liveChatEnhancements.initialize();

        aiChat.remove();
        const replacement = dom.window.document.createElement('button');
        replacement.textContent = 'AI Chat';
        menuShadow.appendChild(replacement);
        await Promise.resolve();
        replacement.click();

        expect(connect).toHaveBeenCalledTimes(1);
        dom.window.close();
    });

    test('suppresses the Moe introduction when AI Chat is hovered', async () => {
        const { dom, aiChat } = setup();
        const nativeHoverAction = jest.fn();
        aiChat.addEventListener('mouseover', nativeHoverAction);
        dom.window.liveChatEnhancements.initialize();

        aiChat.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
        expect(nativeHoverAction).not.toHaveBeenCalled();
        expect(dom.window.document.body.classList).toContain('toolshed-hovering-ai-chat');

        const delayedIntro = dom.window.document.createElement('div');
        delayedIntro.id = 'pendo-base';
        delayedIntro.textContent = 'Moe, your AI-powered support assistant. Select Connect with Moe to start chatting.';
        dom.window.document.body.appendChild(delayedIntro);
        await Promise.resolve();

        expect(dom.window.document.getElementById('pendo-base')).toBeNull();
        aiChat.dispatchEvent(new dom.window.MouseEvent('mouseleave'));
        jest.advanceTimersByTime(750);
        expect(dom.window.document.body.classList).not.toContain('toolshed-hovering-ai-chat');
        dom.window.close();
    });
});
