const ENABLED_KEY = 'diagnosticsModeEnabled';
const EXPIRY_KEY = 'diagnosticsModeExpiresAt';
const EVENTS_KEY = 'diagnosticEvents';
const SESSION_KEY = 'diagnosticsModeSessionActive';
const DIAGNOSTICS_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 1000;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_AREAS = new Set(['home', 'plan', 'buy', 'actualise', 'traffic', 'analyse', 'orders', 'campaign', 'other']);
const ALLOWED_DETAIL_KEYS = new Set([
    'approvedTransitions',
    'checkedCount',
    'dirtyGroupCount',
    'failedCount',
    'initializedCount',
    'pendingCount'
]);

let writeQueue = Promise.resolve();
let cachedState = null;

chrome.storage.onChanged?.addListener?.((changes, area) => {
    if (area !== 'sync' || !changes[ENABLED_KEY]) return;
    cachedState = changes[ENABLED_KEY].newValue === true
        ? null
        : { enabled: false, expiresAt: 0 };
});

function cleanLabel(value, fallback = 'unknown') {
    const label = String(value || fallback).toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 64);
    return label || fallback;
}

function cleanDuration(value) {
    const duration = Number(value);
    if (!Number.isFinite(duration)) return undefined;
    return Math.max(0, Math.min(Math.round(duration), 60 * 60 * 1000));
}

function cleanDetails(details) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
    const clean = {};
    for (const [key, value] of Object.entries(details)) {
        if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) clean[key] = Math.max(0, Math.round(numericValue));
    }
    return Object.keys(clean).length ? clean : undefined;
}

export function sanitizeDiagnosticEvent(event, now = Date.now()) {
    const area = cleanLabel(event?.area, 'other');
    const clean = {
        timestamp: new Date(now).toISOString(),
        source: cleanLabel(event?.source),
        operation: cleanLabel(event?.operation),
        outcome: cleanLabel(event?.outcome, 'success'),
        area: ALLOWED_AREAS.has(area) ? area : 'other'
    };
    const durationMs = cleanDuration(event?.durationMs);
    const details = cleanDetails(event?.details);
    if (durationMs !== undefined) clean.durationMs = durationMs;
    if (details) clean.details = details;
    return clean;
}

export async function expireDiagnosticsIfNeeded(now = Date.now()) {
    if (cachedState?.enabled === false) return cachedState;
    if (cachedState?.enabled === true && cachedState.expiresAt > now) return cachedState;
    const [settings, local, session] = await Promise.all([
        chrome.storage.sync.get({ [ENABLED_KEY]: false }),
        chrome.storage.local.get({ [EXPIRY_KEY]: 0 }),
        chrome.storage.session.get({ [SESSION_KEY]: false })
    ]);
    const enabled = settings[ENABLED_KEY] === true;
    const expiresAt = Number(local[EXPIRY_KEY]) || 0;
    if (!enabled) {
        cachedState = { enabled: false, expiresAt };
        return cachedState;
    }
    if (expiresAt > now && session[SESSION_KEY] === true) {
        cachedState = { enabled: true, expiresAt };
        return cachedState;
    }

    await Promise.all([
        chrome.storage.sync.set({ [ENABLED_KEY]: false }),
        chrome.storage.local.remove(EXPIRY_KEY),
        chrome.storage.session.remove(SESSION_KEY)
    ]);
    cachedState = { enabled: false, expiresAt: 0 };
    return cachedState;
}

export async function enableDiagnostics(now = Date.now()) {
    const expiresAt = now + DIAGNOSTICS_DURATION_MS;
    await Promise.all([
        chrome.storage.local.set({ [EXPIRY_KEY]: expiresAt, [EVENTS_KEY]: [] }),
        chrome.storage.session.set({ [SESSION_KEY]: true })
    ]);
    await chrome.storage.sync.set({ [ENABLED_KEY]: true });
    cachedState = { enabled: true, expiresAt };
    return cachedState;
}

export async function disableDiagnostics() {
    await chrome.storage.sync.set({ [ENABLED_KEY]: false });
    await Promise.all([
        chrome.storage.local.remove(EXPIRY_KEY),
        chrome.storage.session.remove(SESSION_KEY)
    ]);
    cachedState = { enabled: false, expiresAt: 0 };
    return cachedState;
}

export function recordDiagnosticEvent(event, now = Date.now()) {
    writeQueue = writeQueue.then(async () => {
        const state = await expireDiagnosticsIfNeeded(now);
        if (!state.enabled) return { status: 'disabled' };

        const data = await chrome.storage.local.get({ [EVENTS_KEY]: [] });
        const cutoff = now - MAX_EVENT_AGE_MS;
        const events = (Array.isArray(data[EVENTS_KEY]) ? data[EVENTS_KEY] : [])
            .filter(item => Date.parse(item?.timestamp || '') >= cutoff);
        events.push(sanitizeDiagnosticEvent(event, now));
        await chrome.storage.local.set({ [EVENTS_KEY]: events.slice(-MAX_EVENTS) });
        return { status: 'success' };
    }).catch(error => ({ status: 'error', message: String(error?.message || error) }));
    return writeQueue;
}

export async function getDiagnosticReport(now = Date.now()) {
    await writeQueue;
    const state = await expireDiagnosticsIfNeeded(now);
    const data = await chrome.storage.local.get({ [EVENTS_KEY]: [] });
    return {
        format: 'ops-toolshed-diagnostics',
        generatedAt: new Date(now).toISOString(),
        active: state.enabled,
        expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
        events: Array.isArray(data[EVENTS_KEY]) ? data[EVENTS_KEY] : []
    };
}

export function clearDiagnosticEvents() {
    writeQueue = writeQueue.then(async () => {
        await chrome.storage.local.set({ [EVENTS_KEY]: [] });
        return { status: 'success' };
    });
    return writeQueue;
}

export {
    DIAGNOSTICS_DURATION_MS,
    ENABLED_KEY,
    EVENTS_KEY,
    EXPIRY_KEY,
    MAX_EVENTS,
    SESSION_KEY
};
