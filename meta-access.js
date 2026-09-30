(async function() {
    'use strict';
    const KEY = 'socialBookingMetaApiCredentials';
    const get = id => document.getElementById(id);
    const settings = await chrome.storage.sync.get({ allFeaturesDisabled: false, onboardingAudience: 'prisma' });
    if (settings.allFeaturesDisabled || settings.onboardingAudience === 'non-prisma') {
        document.querySelector('main').replaceChildren(document.createTextNode('Enable Prisma features in Settings to manage Meta access.'));
        return;
    }
    async function refresh() {
        const saved = (await chrome.storage.local.get(KEY))?.[KEY];
        get('saved-status').textContent = saved?.accessToken ? 'A Meta token is saved. Replace it if campaign checks report that it has expired.' : 'No Meta token is saved yet.';
        get('remove-token').disabled = !saved?.accessToken;
    }
    get('token-form').addEventListener('submit', async event => {
        event.preventDefault();
        const token = get('token').value.trim();
        if (!token) { get('status').textContent = 'Enter a new Meta access token.'; return; }
        get('save-token').disabled = true;
        try {
            await chrome.storage.local.set({ [KEY]: { accessToken: token } });
            get('token').value = '';
            await refresh();
            get('status').textContent = 'Token saved. Return to your Prisma campaign and choose Check again. Monitored campaigns will use it on their next scheduled check.';
        } catch (_) { get('status').textContent = 'The token could not be saved. Reload the extension and try again.'; }
        finally { get('save-token').disabled = false; }
    });
    get('remove-token').addEventListener('click', async () => {
        try { await chrome.storage.local.remove(KEY); get('token').value = ''; await refresh(); get('status').textContent = 'Saved token removed. Meta comparisons will need a new token.'; }
        catch (_) { get('status').textContent = 'The token could not be removed. Try again.'; }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && (changes.allFeaturesDisabled?.newValue === true || changes.onboardingAudience?.newValue === 'non-prisma')) location.reload();
    });
    try { await refresh(); } catch (_) { get('status').textContent = 'Saved token status is unavailable. Reload the extension and try again.'; }
})();
