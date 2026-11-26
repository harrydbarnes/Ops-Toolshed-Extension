const DEBUGGER_PROTOCOL_VERSION = '1.3';
const MAX_NETWORK_ENTRIES = 2000;
const MAX_CONSOLE_ENTRIES = 2000;
const SLOW_REQUEST_MS = 3000;

const SENSITIVE_HEADER_NAMES = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-csrf-token',
    'x-xsrf-token',
    'x-api-key',
    'x-auth-token'
]);

let activeSession = null;
let lastCompletedCapture = null;
let listenersRegistered = false;

function isMediaoceanUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && (
            parsed.hostname === 'mediaocean.com' ||
            parsed.hostname.endsWith('.mediaocean.com')
        );
    } catch {
        return false;
    }
}

function formatHeaders(headersObj, sanitize) {
    if (!headersObj || typeof headersObj !== 'object') return [];
    const list = [];
    for (const [name, rawValue] of Object.entries(headersObj)) {
        const lower = name.toLowerCase();
        const isSensitive = sanitize && SENSITIVE_HEADER_NAMES.has(lower);
        const value = isSensitive ? '[REDACTED]' : String(rawValue ?? '');
        list.push({ name, value });
    }
    return list;
}

function parseQueryString(url) {
    try {
        const parsed = new URL(url);
        const params = [];
        for (const [name, value] of parsed.searchParams.entries()) {
            params.push({ name, value });
        }
        return params;
    } catch {
        return [];
    }
}

function computeTimings(entry) {
    const timing = entry.timing;
    const totalMs = Math.max(0, Math.round(entry.durationMs || 0));
    if (!timing) {
        return {
            blocked: -1,
            dns: -1,
            connect: -1,
            ssl: -1,
            send: 0,
            wait: totalMs,
            receive: 0
        };
    }

    const diff = (start, end) => (start >= 0 && end >= 0 && end >= start) ? Math.round((end - start) * 100) / 100 : -1;
    const dns = diff(timing.dnsStart, timing.dnsEnd);
    const connect = diff(timing.connectStart, timing.connectEnd);
    const ssl = diff(timing.sslStart, timing.sslEnd);
    const send = Math.max(0, diff(timing.sendStart, timing.sendEnd));
    const wait = Math.max(0, diff(timing.sendEnd, timing.receiveHeadersEnd));
    const blocked = timing.dnsStart > 0
        ? Math.round(timing.dnsStart * 100) / 100
        : (timing.connectStart > 0 ? Math.round(timing.connectStart * 100) / 100 : (timing.sendStart > 0 ? Math.round(timing.sendStart * 100) / 100 : 0));
    const accounted = Math.max(0, blocked) + Math.max(0, dns) + Math.max(0, connect) + send + wait;
    const receive = Math.max(0, Math.round((totalMs - accounted) * 100) / 100);

    return { blocked, dns, connect, ssl, send, wait, receive };
}

function formatRemoteObject(arg) {
    if (!arg || typeof arg !== 'object') return String(arg ?? '');
    if (arg.type === 'string') return String(arg.value ?? '');
    if (arg.type === 'undefined') return 'undefined';
    if (arg.subtype === 'null') return 'null';
    if (Object.prototype.hasOwnProperty.call(arg, 'value') && arg.value !== undefined) {
        return String(arg.value);
    }
    if (arg.description) return String(arg.description);
    if (arg.preview?.properties) {
        const parts = arg.preview.properties.map(p => `${p.name}: ${p.value}`);
        return `{${parts.join(', ')}}`;
    }
    return `[${arg.type || 'object'}]`;
}

export function buildHar(session, version = '') {
    const sanitize = session.sanitize !== false;
    const allEntries = [
        ...session.finishedEntries,
        ...Array.from(session.requests.values())
    ].slice(0, MAX_NETWORK_ENTRIES);

    const pages = (session.pages || []).map(page => ({
        startedDateTime: new Date(page.startedAt).toISOString(),
        id: page.id,
        title: page.title || page.url || 'Prisma',
        pageTimings: { onContentLoad: -1, onLoad: -1 }
    }));

    const entries = allEntries.map(item => {
        const startedDateTime = new Date(item.wallTimeMs || session.startedAt).toISOString();
        const reqHeaders = formatHeaders({ ...(item.requestHeaders || {}), ...(item.extraRequestHeaders || {}) }, sanitize);
        const resHeaders = formatHeaders({ ...(item.responseHeaders || {}), ...(item.extraResponseHeaders || {}) }, sanitize);
        const totalMs = Math.max(0, Math.round(item.durationMs || 0));

        const requestObj = {
            method: item.method || 'GET',
            url: item.url || '',
            httpVersion: item.protocol || 'HTTP/1.1',
            cookies: [],
            headers: reqHeaders,
            queryString: parseQueryString(item.url),
            headersSize: -1,
            bodySize: item.postData ? item.postData.length : 0
        };

        if (item.postData) {
            requestObj.postData = {
                mimeType: item.requestHeaders?.['Content-Type'] || item.requestHeaders?.['content-type'] || 'application/octet-stream',
                text: sanitize ? '[REDACTED]' : String(item.postData)
            };
        }

        const responseObj = {
            status: Number.isFinite(item.status) ? item.status : 0,
            statusText: item.statusText || (item.errorText ? `Failed (${item.errorText})` : ''),
            httpVersion: item.protocol || 'HTTP/1.1',
            cookies: [],
            headers: resHeaders,
            content: {
                size: Number.isFinite(item.encodedDataLength) ? Math.max(0, Math.round(item.encodedDataLength)) : 0,
                mimeType: item.mimeType || 'x-unknown'
            },
            redirectURL: item.redirectURL || '',
            headersSize: -1,
            bodySize: Number.isFinite(item.encodedDataLength) ? Math.max(0, Math.round(item.encodedDataLength)) : -1
        };

        if (item.errorText) {
            responseObj._error = item.errorText;
        }

        const harEntry = {
            startedDateTime,
            time: totalMs,
            request: requestObj,
            response: responseObj,
            cache: {},
            timings: computeTimings(item)
        };
        if (item.pageId) harEntry.pageref = item.pageId;
        if (item.resourceType) harEntry._resourceType = item.resourceType;
        return harEntry;
    });

    return {
        log: {
            version: '1.2',
            creator: {
                name: 'Ops Toolshed',
                version: version || 'unknown'
            },
            pages,
            entries
        }
    };
}

export function buildConsoleLog(session) {
    const lines = [
        `# Ops Toolshed Console Log`,
        `# Started: ${new Date(session.startedAt).toISOString()}`,
        `# Ended: ${new Date(session.endedAt || Date.now()).toISOString()}`,
        `# Initial URL: ${session.initialUrl || 'unknown'}`,
        `# Last URL: ${session.lastUrl || session.initialUrl || 'unknown'}`,
        ''
    ];
    for (const entry of session.consoleEntries || []) {
        const ts = new Date(entry.timestamp || session.startedAt).toISOString();
        const level = String(entry.level || 'LOG').toUpperCase();
        const location = entry.url ? ` (${entry.url}${Number.isFinite(entry.lineNumber) ? `:${entry.lineNumber}` : ''})` : '';
        lines.push(`[${ts}] [${level}]${location} ${entry.text}`);
    }
    return lines.join('\n') + '\n';
}

function summarizeUrlPath(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const path = `${parsed.hostname}${parsed.pathname}`;
        return path.length > 90 ? `${path.slice(0, 87)}...` : path;
    } catch {
        return String(rawUrl || '').slice(0, 90);
    }
}

export function buildEmailSummary(session, har, filenames, version = '') {
    const entries = har?.log?.entries || [];
    const failed = entries.filter(e => e.response.status >= 400 || e.response.status === 0 || e.response._error);
    const slow = entries
        .filter(e => e.time >= SLOW_REQUEST_MS)
        .sort((a, b) => b.time - a.time);
    const consoleErrors = (session.consoleEntries || []).filter(c => c.level === 'error');
    const consoleWarnings = (session.consoleEntries || []).filter(c => c.level === 'warning' || c.level === 'warn');

    const startedIso = new Date(session.startedAt).toISOString();
    const endedIso = new Date(session.endedAt || Date.now()).toISOString();
    const durationSec = Math.max(1, Math.round(((session.endedAt || Date.now()) - session.startedAt) / 1000));
    const stampLabel = startedIso.replace('T', ' ').slice(0, 16) + ' UTC';
    const subject = `Prisma Slowness / Network Capture – ${stampLabel}`;

    const lines = [
        'Hi Support,',
        '',
        'Please find attached the Chrome network (.har) and console (.log) files captured while reproducing the Prisma slowness issue.',
        '',
        'Capture details:',
        `- Time window (UTC): ${startedIso} to ${endedIso} (${durationSec}s)`,
        `- Starting URL: ${session.initialUrl || 'unknown'}`,
        ...(session.lastUrl && session.lastUrl !== session.initialUrl ? [`- Last URL: ${session.lastUrl}`] : []),
        `- Network requests captured: ${entries.length} (${failed.length} failed/error, ${slow.length} >= ${SLOW_REQUEST_MS / 1000}s)`,
        `- Console log entries: ${(session.consoleEntries || []).length} (${consoleErrors.length} errors, ${consoleWarnings.length} warnings)`,
        `- Sensitive headers redacted: ${session.sanitize !== false ? 'Yes (cookies & auth headers redacted)' : 'No'}`,
        `- Captured with: Ops Toolshed v${version || 'unknown'}`
    ];

    if (slow.length > 0) {
        lines.push('', 'Slowest requests:');
        slow.slice(0, 5).forEach(entry => {
            const sec = (entry.time / 1000).toFixed(2);
            lines.push(`- ${entry.request.method} ${entry.response.status || 'ERR'} (${sec}s) ${summarizeUrlPath(entry.request.url)}`);
        });
    }

    if (failed.length > 0) {
        lines.push('', 'Failed / error requests:');
        failed.slice(0, 8).forEach(entry => {
            const detail = entry.response._error || `${entry.response.status} ${entry.response.statusText}`.trim();
            lines.push(`- ${entry.request.method} [${detail}] ${summarizeUrlPath(entry.request.url)}`);
        });
    }

    lines.push(
        '',
        `Attached files:`,
        `- ${filenames.har}`,
        `- ${filenames.log}`,
        '',
        'Steps reproduced:',
        '[Add brief description of what you were doing in Prisma when it was slow]'
    );

    return {
        subject,
        body: lines.join('\n'),
        stats: {
            totalRequests: entries.length,
            failedRequests: failed.length,
            slowRequests: slow.length,
            consoleEntries: (session.consoleEntries || []).length,
            consoleErrors: consoleErrors.length,
            consoleWarnings: consoleWarnings.length,
            durationSec
        }
    };
}

function makeFilenames(startedAt) {
    const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return {
        har: `prisma-network-${stamp}Z.har`,
        log: `prisma-console-${stamp}Z.log`
    };
}

function pushConsoleEntry(session, entry) {
    if (!session || session.consoleEntries.length >= MAX_CONSOLE_ENTRIES) return;
    session.consoleEntries.push(entry);
}

function finalizeEntry(session, requestId, overrides = {}) {
    const entry = session.requests.get(requestId);
    if (!entry) return;
    Object.assign(entry, overrides);
    if (entry.endTimestamp && entry.startTimestamp) {
        entry.durationMs = Math.max(0, (entry.endTimestamp - entry.startTimestamp) * 1000);
    }
    session.requests.delete(requestId);
    if (session.finishedEntries.length < MAX_NETWORK_ENTRIES) {
        session.finishedEntries.push(entry);
    }
}

export function handleDebuggerEvent(source, method, params = {}) {
    if (!activeSession || source?.tabId !== activeSession.tabId) return;
    const session = activeSession;

    if (method === 'Page.frameNavigated' && !params.frame?.parentId && params.frame?.url) {
        session.lastUrl = params.frame.url;
        const pageId = `page_${session.pages.length + 1}`;
        session.currentPageId = pageId;
        session.pages.push({
            id: pageId,
            url: params.frame.url,
            title: params.frame.name || params.frame.url,
            startedAt: Date.now()
        });
        return;
    }

    if (method === 'Network.requestWillBeSent') {
        if (params.redirectResponse && session.requests.has(params.requestId)) {
            const prev = session.requests.get(params.requestId);
            prev.status = params.redirectResponse.status;
            prev.statusText = params.redirectResponse.statusText;
            prev.responseHeaders = params.redirectResponse.headers || {};
            prev.mimeType = params.redirectResponse.mimeType;
            prev.protocol = params.redirectResponse.protocol || prev.protocol;
            prev.timing = params.redirectResponse.timing || prev.timing;
            prev.redirectURL = params.request?.url || '';
            prev.endTimestamp = params.timestamp;
            finalizeEntry(session, params.requestId);
        }

        if (session.finishedEntries.length + session.requests.size >= MAX_NETWORK_ENTRIES) return;
        session.requests.set(params.requestId, {
            requestId: params.requestId,
            pageId: session.currentPageId,
            url: params.request?.url || '',
            method: params.request?.method || 'GET',
            requestHeaders: params.request?.headers || {},
            postData: params.request?.postData || '',
            resourceType: params.type || '',
            wallTimeMs: Number.isFinite(params.wallTime) ? Math.round(params.wallTime * 1000) : Date.now(),
            startTimestamp: params.timestamp || 0,
            durationMs: 0
        });
        return;
    }

    if (method === 'Network.requestWillBeSentExtraInfo') {
        const entry = session.requests.get(params.requestId);
        if (entry && params.headers) {
            entry.extraRequestHeaders = params.headers;
        }
        return;
    }

    if (method === 'Network.responseReceived') {
        const entry = session.requests.get(params.requestId);
        if (entry && params.response) {
            entry.status = params.response.status;
            entry.statusText = params.response.statusText;
            entry.responseHeaders = params.response.headers || {};
            entry.mimeType = params.response.mimeType;
            entry.protocol = params.response.protocol || entry.protocol;
            entry.timing = params.response.timing || entry.timing;
        }
        return;
    }

    if (method === 'Network.responseReceivedExtraInfo') {
        const entry = session.requests.get(params.requestId);
        if (entry && params.headers) {
            entry.extraResponseHeaders = params.headers;
        }
        return;
    }

    if (method === 'Network.loadingFinished') {
        finalizeEntry(session, params.requestId, {
            endTimestamp: params.timestamp,
            encodedDataLength: params.encodedDataLength
        });
        return;
    }

    if (method === 'Network.loadingFailed') {
        finalizeEntry(session, params.requestId, {
            endTimestamp: params.timestamp,
            errorText: params.errorText || (params.canceled ? 'net::ERR_ABORTED' : 'Failed')
        });
        return;
    }

    if (method === 'Runtime.consoleAPICalled') {
        const argsText = (params.args || []).map(formatRemoteObject).join(' ');
        const topFrame = params.stackTrace?.callFrames?.[0];
        pushConsoleEntry(session, {
            timestamp: Number.isFinite(params.timestamp) ? Math.round(params.timestamp) : Date.now(),
            level: params.type || 'log',
            text: argsText,
            url: topFrame?.url || '',
            lineNumber: Number.isFinite(topFrame?.lineNumber) ? topFrame.lineNumber + 1 : undefined
        });
        return;
    }

    if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails || {};
        const text = details.exception?.description || details.text || 'Uncaught exception';
        pushConsoleEntry(session, {
            timestamp: Number.isFinite(params.timestamp) ? Math.round(params.timestamp) : Date.now(),
            level: 'error',
            text,
            url: details.url || '',
            lineNumber: Number.isFinite(details.lineNumber) ? details.lineNumber + 1 : undefined
        });
        return;
    }

    if (method === 'Log.entryAdded' && params.entry) {
        pushConsoleEntry(session, {
            timestamp: Number.isFinite(params.entry.timestamp) ? Math.round(params.entry.timestamp) : Date.now(),
            level: params.entry.level || 'info',
            text: params.entry.text || '',
            url: params.entry.url || '',
            lineNumber: Number.isFinite(params.entry.lineNumber) ? params.entry.lineNumber + 1 : undefined
        });
    }
}

function finalizeSession(session) {
    session.endedAt = Date.now();
    const version = chrome.runtime?.getManifest?.()?.version || '';
    const filenames = makeFilenames(session.startedAt);
    const har = buildHar(session, version);
    const logText = buildConsoleLog(session);
    const email = buildEmailSummary(session, har, filenames, version);

    lastCompletedCapture = {
        capturedAt: session.endedAt,
        startedAt: session.startedAt,
        url: session.lastUrl || session.initialUrl,
        sanitize: session.sanitize !== false,
        filenames,
        harText: JSON.stringify(har, null, 2),
        logText,
        emailSubject: email.subject,
        emailBody: email.body,
        stats: email.stats
    };
    return lastCompletedCapture;
}

export function handleDebuggerDetach(source, reason) {
    if (!activeSession || source?.tabId !== activeSession.tabId) return;
    const session = activeSession;
    activeSession = null;
    session.detachReason = reason || 'detached';
    finalizeSession(session);
}

function ensureDebuggerListeners() {
    if (listenersRegistered || !chrome.debugger) return;
    chrome.debugger.onEvent?.addListener?.(handleDebuggerEvent);
    chrome.debugger.onDetach?.addListener?.(handleDebuggerDetach);
    listenersRegistered = true;
}

async function resolveTargetTab(requestedTabId) {
    if (Number.isInteger(requestedTabId)) {
        const tab = await chrome.tabs.get(requestedTabId);
        if (tab?.id && isMediaoceanUrl(tab.url)) return tab;
    }
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTab = activeTabs?.[0];
    if (activeTab?.id && isMediaoceanUrl(activeTab.url)) return activeTab;

    const prismaTabs = await chrome.tabs.query({ url: 'https://*.mediaocean.com/*' });
    if (prismaTabs?.length) {
        const sorted = [...prismaTabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        return sorted[0];
    }
    return null;
}

export async function startNetworkCapture({ tabId, sanitize = true } = {}) {
    if (!chrome.debugger) {
        return { status: 'error', message: 'Debugger permission is not granted yet.' };
    }
    if (activeSession) {
        return {
            status: 'error',
            message: 'A capture is already running. Stop the current capture first.',
            captureStatus: getNetworkCaptureStatus()
        };
    }

    const tab = await resolveTargetTab(tabId);
    if (!tab?.id) {
        return { status: 'error', message: 'No open Prisma (mediaocean.com) tab found. Open Prisma and try again.' };
    }

    ensureDebuggerListeners();
    const target = { tabId: tab.id };
    try {
        await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
        await chrome.debugger.sendCommand(target, 'Network.enable');
        await chrome.debugger.sendCommand(target, 'Runtime.enable');
        await chrome.debugger.sendCommand(target, 'Log.enable');
        await chrome.debugger.sendCommand(target, 'Page.enable');
    } catch (error) {
        try { await chrome.debugger.detach(target); } catch { /* ignore */ }
        return { status: 'error', message: `Could not attach to Prisma tab: ${error?.message || error}` };
    }

    const now = Date.now();
    activeSession = {
        tabId: tab.id,
        startedAt: now,
        initialUrl: tab.url || '',
        lastUrl: tab.url || '',
        pageTitle: tab.title || 'Prisma',
        sanitize: sanitize !== false,
        currentPageId: 'page_1',
        pages: [{ id: 'page_1', url: tab.url || '', title: tab.title || 'Prisma', startedAt: now }],
        requests: new Map(),
        finishedEntries: [],
        consoleEntries: []
    };

    return {
        status: 'success',
        captureStatus: getNetworkCaptureStatus()
    };
}

export async function stopNetworkCapture() {
    if (!activeSession) {
        if (lastCompletedCapture) {
            return { status: 'success', capture: lastCompletedCapture, captureStatus: getNetworkCaptureStatus() };
        }
        return { status: 'error', message: 'No active capture to stop.' };
    }

    const session = activeSession;
    activeSession = null;
    try {
        await chrome.debugger?.detach?.({ tabId: session.tabId });
    } catch {
        // Tab may already be closed or detached.
    }

    const capture = finalizeSession(session);
    return {
        status: 'success',
        capture,
        captureStatus: getNetworkCaptureStatus()
    };
}

export function getNetworkCaptureStatus() {
    return {
        active: Boolean(activeSession),
        tabId: activeSession?.tabId ?? null,
        startedAt: activeSession?.startedAt ?? null,
        url: activeSession?.lastUrl || activeSession?.initialUrl || '',
        requestCount: activeSession ? activeSession.finishedEntries.length + activeSession.requests.size : 0,
        consoleCount: activeSession ? activeSession.consoleEntries.length : 0,
        sanitize: activeSession ? activeSession.sanitize : true,
        hasLastCapture: Boolean(lastCompletedCapture),
        lastCaptureMeta: lastCompletedCapture ? {
            capturedAt: lastCompletedCapture.capturedAt,
            url: lastCompletedCapture.url,
            filenames: lastCompletedCapture.filenames,
            stats: lastCompletedCapture.stats
        } : null
    };
}

export function getLastNetworkCapture() {
    if (!lastCompletedCapture) {
        return { status: 'empty', capture: null };
    }
    return { status: 'success', capture: lastCompletedCapture };
}

export function clearLastNetworkCapture() {
    lastCompletedCapture = null;
    return { status: 'success', captureStatus: getNetworkCaptureStatus() };
}

export function resetNetworkCaptureForTests() {
    activeSession = null;
    lastCompletedCapture = null;
    listenersRegistered = false;
}
