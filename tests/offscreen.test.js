const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const offscreenScript = fs.readFileSync(
    path.resolve(__dirname, '../offscreen.js'),
    'utf8'
);

function loadOffscreenDocument() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only'
    });
    const { window } = dom;
    let messageListener;

    window.chrome = {
        runtime: {
            onMessage: {
                addListener: jest.fn(listener => {
                    messageListener = listener;
                })
            }
        }
    };
    window.eval(offscreenScript);

    return {
        dom,
        window,
        document: window.document,
        dispatchMessage(message, sendResponse = jest.fn()) {
            return {
                keepChannelOpen: messageListener(message, {}, sendResponse),
                sendResponse
            };
        }
    };
}

describe('offscreen document message handling', () => {
    let context;

    afterEach(() => {
        context?.dom.window.close();
        jest.restoreAllMocks();
    });

    test('reads clipboard text and removes its temporary textarea', () => {
        context = loadOffscreenDocument();
        context.document.execCommand = jest.fn(command => {
            expect(command).toBe('paste');
            context.document.querySelector('textarea').value = 'clipboard value';
            return true;
        });

        const result = context.dispatchMessage({ action: 'readClipboard' });

        expect(result.keepChannelOpen).toBe(true);
        expect(result.sendResponse).toHaveBeenCalledWith({
            status: 'success',
            text: 'clipboard value'
        });
        expect(context.document.querySelector('textarea')).toBeNull();
    });

    test('copies supplied text and removes its temporary textarea', () => {
        context = loadOffscreenDocument();
        context.document.execCommand = jest.fn(command => {
            expect(command).toBe('copy');
            expect(context.document.querySelector('textarea').value).toBe('copy me');
            return true;
        });

        const result = context.dispatchMessage({
            action: 'copyToClipboard',
            text: 'copy me'
        });

        expect(result.keepChannelOpen).toBe(true);
        expect(result.sendResponse).toHaveBeenCalledWith({ status: 'success' });
        expect(context.document.querySelector('textarea')).toBeNull();
    });

    test.each([
        ['readClipboard', 'paste', { status: 'error', message: 'Unable to paste from clipboard.' }],
        ['copyToClipboard', 'copy', { status: 'error' }]
    ])('reports an execCommand failure for %s', (action, command, response) => {
        context = loadOffscreenDocument();
        context.document.execCommand = jest.fn().mockReturnValue(false);

        const result = context.dispatchMessage({ action, text: 'copy me' });

        expect(context.document.execCommand).toHaveBeenCalledWith(command);
        expect(result.sendResponse).toHaveBeenCalledWith(response);
        expect(context.document.querySelector('textarea')).toBeNull();
    });

    test.each([
        ['readClipboard', 'paste'],
        ['copyToClipboard', 'copy']
    ])('returns thrown clipboard errors for %s and still cleans up', (action, command) => {
        context = loadOffscreenDocument();
        const error = new Error(`${command} failed`);
        context.document.execCommand = jest.fn(() => {
            throw error;
        });
        jest.spyOn(context.window.console, 'error').mockImplementation(() => {});

        const result = context.dispatchMessage({ action, text: 'copy me' });

        expect(result.sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: `${command} failed`
        });
        expect(context.document.querySelector('textarea')).toBeNull();
    });

    test('catches rejected audio playback without an unhandled rejection', async () => {
        context = loadOffscreenDocument();
        const playbackError = new Error('Playback blocked');
        const play = jest.fn().mockRejectedValue(playbackError);
        context.window.Audio = jest.fn(() => ({ play }));
        const consoleError = jest
            .spyOn(context.window.console, 'error')
            .mockImplementation(() => {});

        const result = context.dispatchMessage({
            action: 'playAlarm',
            sound: 'alarm.mp3'
        });
        await Promise.resolve();
        await new Promise(resolve => setImmediate(resolve));

        expect(context.window.Audio).toHaveBeenCalledWith('alarm.mp3');
        expect(play).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
            'Error playing audio in offscreen document:',
            playbackError
        );
        expect(result.sendResponse).not.toHaveBeenCalled();
        expect(result.keepChannelOpen).toBeUndefined();
    });
});
