(function exposePopupShortcuts(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.OpsToolshedPopupShortcuts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPopupShortcuts() {
    'use strict';

    const BUILT_IN_SHORTCUTS = Object.freeze([
        { key: 'prisma', label: 'Prisma', elementId: 'prismaButton' },
        { key: 'metaHandbook', label: 'Meta Handbook', elementId: 'metaHandbookButton' },
        { key: 'timesheets', label: 'My Timesheets', elementId: 'timesheetsButton' },
        { key: 'timesheetHelper', label: 'Timesheet Helper', elementId: 'timesheetHelperButton' },
        { key: 'annualLeave', label: 'Annual Leave', elementId: 'annualLeaveButton' },
        { key: 'approvals', label: 'Timesheet Approvals', elementId: 'approvalsButton' },
        { key: 'reccies', label: 'Reccies', elementId: 'recciesButton' },
        { key: 'myOfficeDays', label: 'myOffice Days', elementId: 'officeHoursButton' },
        { key: 'tpoSharepoint', label: 'TPO Sharepoint', elementId: 'tpoSharepointButton' },
        { key: 'approversList', label: 'Prisma Approvers List', elementId: 'approversListButton' },
        { key: 'addCampaign', label: 'Add Campaign', elementId: 'addCampaignButton' },
        { key: 'socialFinanceReport', label: 'Social Booking Checker', elementId: 'socialFinanceReportButton' },
        { key: 'opsGuide', label: 'Ops Guide', elementId: 'opsDreButton' }
    ]);
    const DEFAULT_ENABLED_KEYS = Object.freeze(
        BUILT_IN_SHORTCUTS.filter(shortcut => shortcut.key !== 'myOfficeDays').map(shortcut => shortcut.key)
    );
    const MAX_CUSTOM_SHORTCUTS = 5;
    const MAX_CUSTOM_NAME_LENGTH = 40;
    const MAX_CUSTOM_URL_LENGTH = 1000;
    const knownKeys = new Set(BUILT_IN_SHORTCUTS.map(shortcut => shortcut.key));

    function normalizeShortcutKeys(value) {
        if (!Array.isArray(value)) return [...DEFAULT_ENABLED_KEYS];
        const selected = new Set(value.filter(key => typeof key === 'string' && knownKeys.has(key)));
        return BUILT_IN_SHORTCUTS.filter(shortcut => selected.has(shortcut.key)).map(shortcut => shortcut.key);
    }

    function normalizeCustomShortcut(name, url, enabled = true) {
        const cleanName = String(name ?? '').trim();
        const cleanUrl = String(url ?? '').trim();
        if (!cleanName || cleanName.length > MAX_CUSTOM_NAME_LENGTH || !cleanUrl || cleanUrl.length > MAX_CUSTOM_URL_LENGTH) return null;

        try {
            const parsed = new URL(cleanUrl);
            if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.href.length > MAX_CUSTOM_URL_LENGTH) return null;
            return { name: cleanName, url: parsed.href, enabled: enabled !== false };
        } catch {
            return null;
        }
    }

    function normalizeCustomShortcuts(value) {
        if (!Array.isArray(value)) return [];
        return value
            .slice(0, MAX_CUSTOM_SHORTCUTS)
            .map(item => normalizeCustomShortcut(item?.name, item?.url, item?.enabled))
            .filter(Boolean);
    }

    function writeSync(storageArea, values) {
        return new Promise((resolve, reject) => {
            if (!storageArea?.set) {
                reject(new Error('Sync storage is unavailable.'));
                return;
            }

            let settled = false;
            const finish = error => {
                if (settled) return;
                settled = true;
                if (error) reject(error);
                else resolve();
            };

            try {
                const result = storageArea.set(values, () => {
                    const message = rootChromeLastError()?.message;
                    finish(message ? new Error(message) : undefined);
                });
                if (result?.then) result.then(() => finish(), finish);
            } catch (error) {
                finish(error);
            }
        });
    }

    function rootChromeLastError() {
        return typeof chrome !== 'undefined' ? chrome.runtime?.lastError : undefined;
    }

    function renderEditor(container, settings, save) {
        if (!container) return { refresh: () => {} };
        const document = container.ownerDocument;
        let selectedKeys = normalizeShortcutKeys(settings.popupShortcuts);
        let customShortcuts = normalizeCustomShortcuts(settings.popupCustomShortcuts);
        settings.popupShortcuts = selectedKeys;
        settings.popupCustomShortcuts = customShortcuts;
        container.replaceChildren();

        const instructions = document.createElement('p');
        instructions.className = 'popup-shortcut-instructions';
        instructions.id = 'popup-shortcut-instructions';
        instructions.textContent = 'These buttons mirror the toolbar popup. Click a button to switch it on or off, or drag it between the two areas. Reset restores the default buttons and turns off custom links, which stay saved in Turned off.';
        container.appendChild(instructions);

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'popup-shortcut-reset';
        resetButton.dataset.popupShortcutReset = '';
        resetButton.textContent = 'Reset to defaults';
        resetButton.setAttribute('aria-describedby', instructions.id);

        const board = document.createElement('div');
        board.className = 'popup-shortcut-board';
        const shownLane = createLane('Shown in popup', 'shown', false, resetButton);
        const disabledLane = createLane('Turned off', 'off', true);
        board.append(shownLane.section, disabledLane.section);
        container.appendChild(board);

        const form = document.createElement('form');
        form.className = 'popup-shortcut-custom-form';
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Button name';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.name = 'shortcutName';
        nameInput.maxLength = MAX_CUSTOM_NAME_LENGTH;
        nameInput.autocomplete = 'off';
        nameInput.required = true;
        nameInput.placeholder = 'e.g. Team dashboard';
        nameLabel.appendChild(nameInput);
        const urlLabel = document.createElement('label');
        urlLabel.textContent = 'URL';
        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.name = 'shortcutUrl';
        urlInput.maxLength = MAX_CUSTOM_URL_LENGTH;
        urlInput.autocomplete = 'url';
        urlInput.required = true;
        urlInput.placeholder = 'https://example.com';
        urlLabel.appendChild(urlInput);
        const addButton = document.createElement('button');
        addButton.type = 'submit';
        addButton.textContent = 'Add custom shortcut';
        form.append(nameLabel, urlLabel, addButton);
        container.appendChild(form);

        const status = document.createElement('p');
        status.className = 'popup-shortcut-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        container.appendChild(status);

        function setBusy(busy) {
            container.querySelectorAll('input, button').forEach(control => { control.disabled = busy; });
        }

        function setStatus(message, error = false) {
            status.textContent = message;
            status.dataset.state = error ? 'error' : 'saved';
        }

        function createLane(title, zoneName, disabledLane, actionButton) {
            const section = document.createElement('section');
            section.className = disabledLane ? 'popup-shortcut-lane popup-shortcut-dropzone' : 'popup-shortcut-lane popup-shortcut-shown';
            section.setAttribute('aria-label', title);
            section.dataset.popupShortcutDropZone = zoneName;
            const heading = document.createElement('h3');
            heading.textContent = title;
            const header = document.createElement('div');
            header.className = 'popup-shortcut-lane-header';
            header.appendChild(heading);
            if (actionButton) header.appendChild(actionButton);
            const help = document.createElement('p');
            help.className = 'popup-shortcut-lane-help';
            help.textContent = disabledLane
                ? 'Drop buttons here to hide them from the popup. Drag them back to restore.'
                : 'Buttons here will appear in the toolbar popup.';
            const tiles = document.createElement('div');
            tiles.className = 'popup-shortcut-tiles';
            tiles.setAttribute('role', 'list');
            tiles.setAttribute('aria-label', title);
            section.addEventListener('dragover', event => {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                section.classList.add('is-drop-target');
            });
            section.addEventListener('dragleave', event => {
                if (!section.contains(event.relatedTarget)) section.classList.remove('is-drop-target');
            });
            section.addEventListener('drop', event => {
                event.preventDefault();
                section.classList.remove('is-drop-target');
                const shortcutId = event.dataTransfer?.getData('text/plain');
                if (shortcutId) void setShortcutEnabled(shortcutId, zoneName === 'shown');
            });
            section.append(header, help, tiles);
            return { section, tiles };
        }

        function createTile({ id, label, kind, index, active }) {
            const wrapper = document.createElement('div');
            wrapper.className = 'popup-shortcut-tile-wrap';
            wrapper.setAttribute('role', 'listitem');
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'nav-button popup-shortcut-tile';
            tile.textContent = label;
            tile.draggable = true;
            tile.dataset.shortcutId = id;
            tile.setAttribute('aria-pressed', String(active));
            tile.setAttribute('aria-describedby', instructions.id);
            tile.setAttribute('aria-label', `${label}, ${active ? 'shown in popup' : 'turned off'}. Click or drag to ${active ? 'turn off' : 'turn on'}.`);
            if (kind === 'builtin') tile.dataset.popupShortcutOption = id.slice('builtin:'.length);
            else tile.dataset.popupCustomShortcut = String(index);
            tile.addEventListener('click', () => { void setShortcutEnabled(id, !active); });
            tile.addEventListener('dragstart', event => {
                if (!event.dataTransfer) return;
                event.dataTransfer.setData('text/plain', id);
                event.dataTransfer.effectAllowed = 'move';
                wrapper.classList.add('is-dragging');
            });
            tile.addEventListener('dragend', () => {
                wrapper.classList.remove('is-dragging');
                container.querySelectorAll('.is-drop-target').forEach(zone => zone.classList.remove('is-drop-target'));
            });
            wrapper.appendChild(tile);

            if (kind === 'custom') {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'popup-shortcut-remove';
                remove.textContent = 'Remove';
                remove.setAttribute('aria-label', `Remove ${label} shortcut`);
                remove.addEventListener('click', () => {
                    const next = customShortcuts.filter((_, currentIndex) => currentIndex !== index);
                    void persist({ popupCustomShortcuts: next });
                });
                wrapper.appendChild(remove);
            }
            return wrapper;
        }

        function renderBoard() {
            shownLane.tiles.replaceChildren();
            disabledLane.tiles.replaceChildren();

            BUILT_IN_SHORTCUTS.forEach(shortcut => {
                const active = selectedKeys.includes(shortcut.key);
                const tile = createTile({
                    id: `builtin:${shortcut.key}`,
                    label: shortcut.label,
                    kind: 'builtin',
                    active
                });
                (active ? shownLane.tiles : disabledLane.tiles).appendChild(tile);
            });

            customShortcuts.forEach((shortcut, index) => {
                const tile = createTile({
                    id: `custom:${index}`,
                    label: shortcut.name,
                    kind: 'custom',
                    index,
                    active: shortcut.enabled
                });
                (shortcut.enabled ? shownLane.tiles : disabledLane.tiles).appendChild(tile);
            });
            addButton.disabled = customShortcuts.length >= MAX_CUSTOM_SHORTCUTS;
        }

        async function setShortcutEnabled(shortcutId, enabled) {
            if (shortcutId.startsWith('builtin:')) {
                const key = shortcutId.slice('builtin:'.length);
                if (!knownKeys.has(key) || selectedKeys.includes(key) === enabled) return;
                const next = enabled
                    ? [...selectedKeys, key]
                    : selectedKeys.filter(selectedKey => selectedKey !== key);
                await persist({ popupShortcuts: next });
                return;
            }

            if (shortcutId.startsWith('custom:')) {
                const index = Number(shortcutId.slice('custom:'.length));
                if (!Number.isInteger(index) || !customShortcuts[index] || customShortcuts[index].enabled === enabled) return;
                const next = customShortcuts.map((shortcut, currentIndex) => currentIndex === index
                    ? { ...shortcut, enabled }
                    : shortcut);
                await persist({ popupCustomShortcuts: next });
            }
        }

        async function persist(patch, clearCustomInputs = false, successMessage = 'Saved') {
            setBusy(true);
            setStatus('Saving…');
            try {
                await save(patch);
                if (Object.prototype.hasOwnProperty.call(patch, 'popupShortcuts')) {
                    selectedKeys = normalizeShortcutKeys(patch.popupShortcuts);
                    settings.popupShortcuts = selectedKeys;
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'popupCustomShortcuts')) {
                    customShortcuts = normalizeCustomShortcuts(patch.popupCustomShortcuts);
                    settings.popupCustomShortcuts = customShortcuts;
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'popupShortcuts')
                    || Object.prototype.hasOwnProperty.call(patch, 'popupCustomShortcuts')) {
                    renderBoard();
                }
                if (clearCustomInputs) {
                    nameInput.value = '';
                    urlInput.value = '';
                }
                setStatus(successMessage);
            } catch {
                onFailure?.();
                setStatus('Could not save this setting. Try again.', true);
            } finally {
                setBusy(false);
                if (customShortcuts.length >= MAX_CUSTOM_SHORTCUTS) addButton.disabled = true;
            }
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            if (customShortcuts.length >= MAX_CUSTOM_SHORTCUTS) {
                setStatus(`You can add up to ${MAX_CUSTOM_SHORTCUTS} custom shortcuts.`, true);
                return;
            }
            const shortcut = normalizeCustomShortcut(nameInput.value, urlInput.value);
            if (!shortcut) {
                setStatus('Enter a name and a valid http or https URL.', true);
                return;
            }
            void persist({ popupCustomShortcuts: [...customShortcuts, shortcut] }, true);
        });

        resetButton.addEventListener('click', () => {
            const disabledCustomShortcuts = customShortcuts.map(shortcut => ({ ...shortcut, enabled: false }));
            void persist({
                popupShortcuts: [...DEFAULT_ENABLED_KEYS],
                popupCustomShortcuts: disabledCustomShortcuts
            }, false, 'Default buttons restored. Custom links are saved in Turned off.');
        });

        renderBoard();
        return {
            refresh() { renderEditor(container, settings, save); }
        };
    }

    return Object.freeze({
        BUILT_IN_SHORTCUTS,
        DEFAULT_ENABLED_KEYS,
        MAX_CUSTOM_SHORTCUTS,
        normalizeShortcutKeys,
        normalizeCustomShortcut,
        normalizeCustomShortcuts,
        renderEditor,
        writeSync
    });
});
