import {
    startNetworkCapture,
    stopNetworkCapture,
    getNetworkCaptureStatus,
    getLastNetworkCapture,
    clearLastNetworkCapture,
    handleDebuggerEvent,
    handleDebuggerDetach,
    resetNetworkCaptureForTests
} from '../background/network-capture.js';

describe('Network & Console Capture (HAR + .log)', () => {
    beforeEach(() => {
        resetNetworkCaptureForTests();
        global.chrome = {
            runtime: {
                getManifest: jest.fn(() => ({ version: '1.9' }))
            },
            tabs: {
                get: jest.fn(),
                query: jest.fn(async ({ active }) => {
                    if (active) {
                        return [{ id: 42, url: 'https://go.mediaocean.com/mo-op-discovery/op/users', title: 'Prisma' }];
                    }
                    return [];
                })
            },
            debugger: {
                attach: jest.fn(async () => {}),
                detach: jest.fn(async () => {}),
                sendCommand: jest.fn(async () => {}),
                onEvent: { addListener: jest.fn() },
                onDetach: { addListener: jest.fn() }
            }
        };
    });

    test('captures network requests, redirects, failures, and console logs into HAR 1.2, .log, and email summary', async () => {
        const startRes = await startNetworkCapture({ sanitize: true });
        expect(startRes.status).toBe('success');
        expect(startRes.captureStatus.active).toBe(true);
        expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 42 }, '1.3');
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 42 }, 'Network.enable');
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 42 }, 'Runtime.enable');
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 42 }, 'Log.enable');
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 42 }, 'Page.enable');

        const source = { tabId: 42 };
        // Simulate a slow API request with sensitive headers
        handleDebuggerEvent(source, 'Network.requestWillBeSent', {
            requestId: 'req-1',
            type: 'XHR',
            wallTime: 1700000000,
            timestamp: 100,
            request: {
                url: 'https://go.mediaocean.com/api/campaigns?page=1',
                method: 'POST',
                headers: {
                    Authorization: 'Bearer secret-token',
                    Cookie: 'session=abc',
                    'Content-Type': 'application/json'
                },
                postData: '{"secret":"payload"}'
            }
        });
        handleDebuggerEvent(source, 'Network.responseReceived', {
            requestId: 'req-1',
            response: {
                status: 200,
                statusText: 'OK',
                mimeType: 'application/json',
                protocol: 'h2',
                headers: { 'Set-Cookie': 'sid=xyz', 'Content-Type': 'application/json' },
                timing: { dnsStart: 0, dnsEnd: 10, connectStart: 10, connectEnd: 30, sslStart: 15, sslEnd: 30, sendStart: 30, sendEnd: 35, receiveHeadersEnd: 4200 }
            }
        });
        handleDebuggerEvent(source, 'Network.loadingFinished', {
            requestId: 'req-1',
            timestamp: 104.5,
            encodedDataLength: 2048
        });

        // Simulate a failed request
        handleDebuggerEvent(source, 'Network.requestWillBeSent', {
            requestId: 'req-2',
            type: 'Fetch',
            wallTime: 1700000005,
            timestamp: 105,
            request: { url: 'https://go.mediaocean.com/api/timeout', method: 'GET', headers: {} }
        });
        handleDebuggerEvent(source, 'Network.loadingFailed', {
            requestId: 'req-2',
            timestamp: 110,
            errorText: 'net::ERR_TIMED_OUT'
        });

        // Simulate cross-navigation (Keep log)
        handleDebuggerEvent(source, 'Page.frameNavigated', {
            frame: { url: 'https://go.mediaocean.com/campaign-management/', name: '' }
        });

        // Simulate console error & exception
        handleDebuggerEvent(source, 'Runtime.consoleAPICalled', {
            type: 'error',
            timestamp: 1700000006000,
            args: [{ type: 'string', value: 'Failed to load grid' }],
            stackTrace: { callFrames: [{ url: 'https://go.mediaocean.com/app.js', lineNumber: 41 }] }
        });
        handleDebuggerEvent(source, 'Runtime.exceptionThrown', {
            timestamp: 1700000007000,
            exceptionDetails: { text: 'Uncaught TypeError', url: 'https://go.mediaocean.com/app.js', lineNumber: 99 }
        });

        const statusWhileActive = getNetworkCaptureStatus();
        expect(statusWhileActive.requestCount).toBe(2);
        expect(statusWhileActive.consoleCount).toBe(2);

        const stopRes = await stopNetworkCapture();
        expect(stopRes.status).toBe('success');
        expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 42 });

        const capture = stopRes.capture;
        expect(capture.filenames.har).toMatch(/^prisma-network-.*Z\.har$/);
        expect(capture.filenames.log).toMatch(/^prisma-console-.*Z\.log$/);

        const har = JSON.parse(capture.harText);
        expect(har.log.version).toBe('1.2');
        expect(har.log.pages).toHaveLength(2);
        expect(har.log.entries).toHaveLength(2);

        // Sensitive headers & postData redacted
        const firstEntry = har.log.entries[0];
        expect(firstEntry.request.headers.find(h => h.name === 'Authorization').value).toBe('[REDACTED]');
        expect(firstEntry.request.headers.find(h => h.name === 'Cookie').value).toBe('[REDACTED]');
        expect(firstEntry.response.headers.find(h => h.name === 'Set-Cookie').value).toBe('[REDACTED]');
        expect(firstEntry.request.postData.text).toBe('[REDACTED]');
        expect(firstEntry.time).toBe(4500);

        // Failed request recorded
        expect(har.log.entries[1].response._error).toBe('net::ERR_TIMED_OUT');

        // Console log formatted
        expect(capture.logText).toContain('[ERROR] (https://go.mediaocean.com/app.js:42) Failed to load grid');
        expect(capture.logText).toContain('Uncaught TypeError');

        // Email summary includes key stats and filenames
        expect(capture.emailSubject).toContain('Prisma Slowness / Network Capture');
        expect(capture.emailBody).toContain('Network requests captured: 2 (1 failed/error, 2 >= 3s)');
        expect(capture.emailBody).toContain(capture.filenames.har);
        expect(capture.emailBody).toContain(capture.filenames.log);

        // Stored as last capture
        expect(getLastNetworkCapture().status).toBe('success');
        clearLastNetworkCapture();
        expect(getLastNetworkCapture().status).toBe('empty');
    });

    test('returns an error when no Prisma tab is open', async () => {
        chrome.tabs.query.mockResolvedValue([]);
        const res = await startNetworkCapture();
        expect(res.status).toBe('error');
        expect(res.message).toMatch(/No open Prisma/i);
    });

    test('finalizes capture automatically if debugger is detached externally', async () => {
        await startNetworkCapture();
        handleDebuggerEvent({ tabId: 42 }, 'Runtime.consoleAPICalled', {
            type: 'warn',
            timestamp: 1700000000000,
            args: [{ type: 'string', value: 'Slow response' }]
        });
        handleDebuggerDetach({ tabId: 42 }, 'canceled_by_user');

        expect(getNetworkCaptureStatus().active).toBe(false);
        expect(getNetworkCaptureStatus().hasLastCapture).toBe(true);
        expect(getLastNetworkCapture().capture.logText).toContain('Slow response');
    });
});
