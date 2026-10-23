/** @jest-environment ./tests/jsdom-environment.cjs */
import fs from 'fs';
import path from 'path';
import '../approvers.js';

describe('Approver Finder interactions', () => {
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    const select = () => document.querySelector('.approver-select');
    const star = () => document.querySelector('.favorite-star');
    const message = () => document.querySelector('.toast-message').textContent;

    beforeEach(async () => {
        jest.useFakeTimers();
        document.body.innerHTML = fs.readFileSync(path.resolve('approvers.html'), 'utf8');
        global.chrome = { storage: { local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue() } } };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await flush();
    });

    afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); document.body.innerHTML = ''; });

    test('rapid reselection keeps copy actions visible after the old hide deadline', () => {
        select().click();
        select().click();
        jest.advanceTimersByTime(100);
        select().click();
        jest.advanceTimersByTime(300);
        const footer = document.querySelector('.footer-actions');
        expect(footer.classList.contains('visible')).toBe(true);
        expect(footer.classList.contains('hidden')).toBe(false);
        expect(footer.classList.contains('hiding')).toBe(false);
    });

    test('selection and favourite are separately focusable native buttons with accurate state', async () => {
        expect(select().tagName).toBe('BUTTON');
        expect(star().tagName).toBe('BUTTON');
        select().focus();
        expect(document.activeElement).toBe(select());
        select().click();
        expect(select().getAttribute('aria-pressed')).toBe('true');
        star().focus();
        expect(document.activeElement).toBe(star());
        star().click();
        await flush();
        expect(star().getAttribute('aria-pressed')).toBe('true');
        expect(select().getAttribute('aria-pressed')).toBe('true');
        select().click();
        expect(select().getAttribute('aria-pressed')).toBe('false');
    });

    test('failed favourite save restores its state and reports the failure', async () => {
        chrome.storage.local.set.mockRejectedValue(new Error('Unavailable'));
        star().click();
        await flush();
        expect(star().getAttribute('aria-pressed')).toBe('false');
        expect(star().disabled).toBe(false);
        expect(message()).toContain('Could not save favourites');
    });

    test.each(['copy-button', 'copy-save-button'])('reports clipboard failure for %s without saving', async id => {
        select().click();
        navigator.clipboard.writeText.mockRejectedValue(new Error('Denied'));
        document.getElementById(id).click();
        await flush();
        expect(message()).toContain('Could not copy approvers');
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
        expect(document.getElementById(id).disabled).toBe(false);
    });

    test('reports partial success when copy succeeds but saving fails', async () => {
        select().click();
        chrome.storage.local.set.mockRejectedValue(new Error('Unavailable'));
        document.getElementById('copy-save-button').click();
        await flush();
        expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
        expect(message()).toContain('Copied to clipboard, but could not save');
        expect(star().getAttribute('aria-pressed')).toBe('false');
    });

    test('waits for confirmed storage before announcing copy and save success', async () => {
        let resolveSave;
        chrome.storage.local.set.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
        select().click();
        document.getElementById('copy-save-button').click();
        await flush();
        expect(message()).not.toContain('Favourites updated');
        resolveSave();
        await flush();
        expect(message()).toBe('Favourites updated and copied to clipboard!');
        expect(star().getAttribute('aria-pressed')).toBe('true');
    });
});
