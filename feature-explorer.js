(async function() {
    'use strict';
    if (window.opsToolshedPageGate && !(await window.opsToolshedPageGate.allow())) return;
    const { FEATURE_CATALOGUE, BOOLEAN_DEFAULTS } = window.OpsToolshedFeatureSettings;
    const groups = {
        all: 'All features', navigate: 'Navigation', create: 'Create & copy',
        orders: 'Orders & Actualise', approve: 'Approvals & checks', help: 'Help', personalise: 'Personalisation'
    };
    const search = document.getElementById('feature-search');
    const list = document.getElementById('feature-list');
    let selectedGroup = 'all';
    let settings = null;
    const dependencies = {
        approvalBannerIndicatorEnabled: 'approvalTrackingEnabled',
        approvalToastNotificationEnabled: 'approvalTrackingEnabled',
        rememberAccountSwitchUrlEnabled: 'swapAccountsEnabled',
        autoCopyUrlMode: 'autoCopyUrlEnabled'
    };
    const choiceLabels = { pink: 'Pink', black: 'Black', social: 'Booking Checker', legacy: 'Billing Check', short: 'Short', full: 'Full' };
    const cards = FEATURE_CATALOGUE.map(feature => {
        const card = document.createElement('details');
        card.className = 'explorer-feature';
        card.id = feature.id;
        const summary = document.createElement('summary');
        const title = document.createElement('strong');
        title.textContent = feature.title;
        const state = document.createElement('span');
        state.className = 'feature-state';
        summary.append(title, document.createTextNode(' '), state);
        const description = document.createElement('p');
        description.textContent = feature.description;
        card.append(summary, description);
        if (feature.image) {
            const image = document.createElement('img');
            image.src = feature.image.src;
            image.alt = feature.image.alt;
            image.loading = 'lazy';
            image.addEventListener('error', () => { image.hidden = true; });
            card.append(image);
        } else {
            const note = document.createElement('p');
            note.className = 'preview-status';
            note.textContent = feature.previewNote;
            card.append(note);
        }
        const link = document.createElement('a');
        link.href = feature.href;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = feature.href.startsWith('settings') ? 'Open setting in a new tab' : 'Open tool in a new tab';
        card.append(link);
        list.append(card);
        return { feature, card, state };
    });
    function updateStates() {
        cards.forEach(({ feature, state }) => {
            if (!feature.setting) { state.textContent = 'Available to explore'; return; }
            if (!settings) { state.textContent = 'Setting unavailable'; return; }
            const value = settings[feature.setting];
            const parent = dependencies[feature.setting];
            state.textContent = parent && settings[parent] === false ? 'Paused by parent setting'
                : typeof value === 'boolean' ? (value ? 'On' : 'Off')
                    : value === undefined ? 'Choose in Settings' : `Selected: ${choiceLabels[value] || value}`;
        });
    }
    function filter() {
        const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        let visible = 0;
        cards.forEach(({ feature, card }) => {
            const text = `${feature.title} ${feature.description} ${groups[feature.group]}`.toLocaleLowerCase();
            card.hidden = !(selectedGroup === 'all' || selectedGroup === feature.group) || !words.every(word => text.includes(word));
            if (!card.hidden) visible++;
        });
        document.getElementById('explorer-count').textContent = `${visible} of ${cards.length} features`;
        document.getElementById('explorer-empty').hidden = visible !== 0;
    }
    Object.entries(groups).forEach(([key, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-pressed', String(key === selectedGroup));
        button.addEventListener('click', () => {
            selectedGroup = key;
            document.querySelectorAll('#feature-groups button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            filter();
        });
        document.getElementById('feature-groups').append(button);
    });
    search.addEventListener('input', filter);
    search.addEventListener('keydown', event => { if (event.key === 'Escape') { search.value = ''; filter(); } });
    updateStates();
    filter();
    try {
        settings = await new Promise((resolve, reject) => {
            const result = chrome.storage.sync.get({ ...BOOLEAN_DEFAULTS, uiTheme: 'pink', autoCopyUrlMode: 'short', metaFinanceToolMode: 'social' }, value => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(value);
            });
            result?.then?.(resolve, reject);
        });
        updateStates();
    } catch { /* Keep descriptions usable even if settings cannot be read. */ }
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !settings) return;
        Object.entries(changes).forEach(([key, value]) => { settings[key] = value.newValue ?? BOOLEAN_DEFAULTS[key]; });
        updateStates();
    });
})();
