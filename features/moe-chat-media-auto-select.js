(function() {
    'use strict';

    const SETTING_KEY = 'moeChatMediaAutoSelectEnabled';
    const ACTION_MARKER = 'opsToolshedMoeMediaAutoSelected';
    const MEDIA_ICON_SELECTOR = [
        '#ptb-header mo-icon[name]',
        '.ptb-header mo-icon[name]',
        '.mo-page-header mo-icon[name]'
    ].join(',');
    const CHAT_FRAME_SELECTOR = [
        'iframe[name="Messaging window"]',
        'iframe[title*="messaging" i]',
        'iframe[title*="chat" i]'
    ].join(',');
    const MEDIA_ICON_LABELS = Object.freeze({
        digital: 'Digital',
        print: 'Print',
        tv: 'TV',
        television: 'TV',
        radio: 'Radio',
        audio: 'Audio',
        ooh: 'OOH',
        outofhome: 'OOH',
        cinema: 'Cinema',
        social: 'Social',
        video: 'Video'
    });
    const PLACEHOLDER_VALUES = new Set(['', '-', 'select media', 'select']);

    let initialized = false;
    let enabled = false;
    let parentObserver = null;
    let observedRoots = new Map();
    let openingControls = new WeakSet();
    let pendingActions = new WeakSet();
    let pendingScanTimers = new Set();
    const MAX_SEND_ATTEMPTS = 8;

    function normalize(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function getCampaignMediaType() {
        if (typeof document === 'undefined' || !document.querySelectorAll) return null;
        const icons = Array.from(document.querySelectorAll(MEDIA_ICON_SELECTOR));
        for (const icon of icons) {
            const name = normalize(icon.getAttribute('name'));
            if (MEDIA_ICON_LABELS[name]) return MEDIA_ICON_LABELS[name];
        }
        return null;
    }

    function getText(element) {
        return normalize(element?.textContent || '');
    }

    function getElementById(root, id) {
        if (!root || !id) return null;
        if (typeof root.getElementById === 'function') return root.getElementById(id);
        return Array.from(root.querySelectorAll?.('[id]') || [])
            .find(element => element.id === id) || null;
    }

    function getAssociatedLabel(control, root) {
        const labelledBy = control.getAttribute?.('aria-labelledby');
        if (labelledBy) {
            const labelText = labelledBy
                .split(/\s+/)
                .map(id => getElementById(root, id))
                .filter(Boolean)
                .map(getText)
                .filter(Boolean)
                .join(' ');
            if (labelText) return labelText;
        }

        const ariaLabel = normalize(control.getAttribute?.('aria-label'));
        if (ariaLabel) return ariaLabel;

        const field = control.closest?.(
            '[data-garden-id="containers.field"], [data-garden-id*="field"], label, fieldset, [role="group"]'
        );
        if (!field) return '';

        const visibleLabel = field.querySelector?.('label, [data-garden-id="labels.field"]');
        return getText(visibleLabel || field);
    }

    function isMediaControl(control, root) {
        const label = getAssociatedLabel(control, root);
        if (label === 'media' || label.startsWith('media ')) return true;

        const labelledBy = control.getAttribute?.('aria-labelledby');
        if (labelledBy && normalize(labelledBy).includes('media')) return true;

        const field = control.closest?.('[data-garden-id*="field"], [role="group"], label');
        return Boolean(field && /^media(?:\s|$)/i.test(field.textContent?.trim() || ''));
    }

    function getMediaControls(root) {
        if (!root?.querySelectorAll) return [];
        return Array.from(root.querySelectorAll('select, [role="combobox"]'))
            .filter(control => isMediaControl(control, root));
    }

    function getControlContainer(control) {
        return control.closest?.(
            '[data-garden-id="containers.field"], [data-garden-id="dropdowns.combobox.trigger"], [role="group"], fieldset, label'
        ) || control.parentElement;
    }

    function getControlValue(control) {
        if (control.matches?.('select')) {
            const selected = control.options?.[control.selectedIndex];
            return normalize(selected?.textContent || control.value);
        }

        const directValue = normalize(control.value || control.getAttribute?.('value'));
        if (directValue && !PLACEHOLDER_VALUES.has(directValue)) return directValue;

        const container = getControlContainer(control);
        const valueNode = container?.querySelector?.('[data-garden-id="dropdowns.combobox.value"]');
        return normalize(valueNode?.textContent || directValue);
    }

    function isPlaceholderControl(control) {
        return PLACEHOLDER_VALUES.has(getControlValue(control));
    }

    function optionLabel(option) {
        return normalize(option?.textContent || option?.getAttribute?.('aria-label'));
    }

    function findMatchingOption(root, control, mediaType) {
        const optionSelector = control.matches?.('select')
            ? 'option'
            : '[role="option"]';
        const options = Array.from(root.querySelectorAll?.(optionSelector) || []);
        const wanted = normalize(mediaType);
        return options.find(option => {
            const label = optionLabel(option);
            return label === wanted || label.startsWith(`${wanted} `);
        }) || null;
    }

    function findControlTrigger(control) {
        const controlsId = control.getAttribute?.('aria-controls');
        const triggerSelector = controlsId
            ? Array.from(control.ownerDocument?.querySelectorAll?.('[aria-controls]') || [])
                .find(element => element.getAttribute('aria-controls') === controlsId)
            : null;
        return control.closest?.('[data-garden-id="dropdowns.combobox.trigger"]') ||
            triggerSelector ||
            control;
    }

    function openControl(control) {
        if (openingControls.has(control)) return;
        openingControls.add(control);
        const trigger = findControlTrigger(control);
        try {
            trigger?.click?.();
        } catch (_error) {
            // The chat may be replaced while the dropdown is opening.
        }
    }

    function findSendButton(root) {
        return Array.from(root.querySelectorAll?.('button, [role="button"]') || [])
            .find(button => normalize(button.textContent || button.getAttribute?.('aria-label')) === 'send') || null;
    }

    function isDisabled(button) {
        return Boolean(button?.disabled || button?.hasAttribute?.('disabled') ||
            button?.getAttribute?.('aria-disabled') === 'true');
    }

    function recordAction(outcome, mediaType) {
        window.opsDiagnostics?.record?.({
            source: 'moe-chat-media',
            operation: 'auto-select-media',
            outcome,
            trigger: 'mutation',
            details: { mediaType }
        });
    }

    function scheduleSendAttempt(control, root, mediaType, attempt = 0) {
        const timer = setTimeout(() => {
            pendingScanTimers.delete(timer);
            if (!enabled || !control.isConnected) {
                pendingActions.delete(control);
                return;
            }

            const sendButton = findSendButton(root);
            if (sendButton && !isDisabled(sendButton)) {
                control.dataset[ACTION_MARKER] = 'true';
                pendingActions.delete(control);
                sendButton.click();
                recordAction('success', mediaType);
                return;
            }

            if (attempt + 1 < MAX_SEND_ATTEMPTS) {
                scheduleSendAttempt(control, root, mediaType, attempt + 1);
            } else {
                pendingActions.delete(control);
            }
        }, 0);
        pendingScanTimers.add(timer);
    }

    function selectAndSend(control, option, root, mediaType) {
        if (pendingActions.has(control) || control.dataset?.[ACTION_MARKER] === 'true') return;
        pendingActions.add(control);

        try {
            if (control.matches?.('select')) {
                control.value = option.value;
                control.dispatchEvent(new Event('input', { bubbles: true }));
                control.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                option.click?.();
            }
        } catch (_error) {
            pendingActions.delete(control);
            return;
        }

        // Let the control's own change handler commit first, then send on the
        // next task. This avoids an arbitrary visible pause while still
        // tolerating a framework-rendered Send button.
        scheduleSendAttempt(control, root, mediaType);
    }

    function scanRoot(root) {
        if (!enabled || !root?.querySelectorAll || typeof document === 'undefined') return;
        const mediaType = getCampaignMediaType();
        if (!mediaType) return;

        getMediaControls(root).forEach(control => {
            if (!isPlaceholderControl(control)) return;

            const option = findMatchingOption(root, control, mediaType);
            if (option) {
                openingControls.delete(control);
                selectAndSend(control, option, root, mediaType);
            } else {
                openControl(control);
            }
        });
    }

    function observeRoot(root) {
        if (!root || observedRoots.has(root) || typeof MutationObserver !== 'function') return;
        const observer = new MutationObserver(() => scanRoot(root));
        const target = root.documentElement || root;
        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-expanded', 'aria-selected', 'hidden', 'value']
        });
        observedRoots.set(root, observer);
        scanRoot(root);
    }

    function collectChatRoots() {
        const roots = [];
        const visited = new Set();
        const visit = root => {
            if (!root || visited.has(root)) return;
            visited.add(root);
            roots.push(root);
            root.querySelectorAll?.('iframe').forEach(frame => {
                try {
                    if (frame.contentDocument) visit(frame.contentDocument);
                } catch (_error) {
                    // Cross-origin chat frames are intentionally ignored.
                }
            });
        };

        document.querySelectorAll(CHAT_FRAME_SELECTOR).forEach(frame => {
            try {
                if (frame.contentDocument) visit(frame.contentDocument);
            } catch (_error) {
                // Cross-origin chat frames are intentionally ignored.
            }
        });
        return roots;
    }

    function hasChatFrameMutation(mutations) {
        return mutations.some(mutation => {
            if (mutation.type !== 'childList') return false;
            return Array.from(mutation.addedNodes || []).some(node =>
                node.nodeType === 1 && (
                    node.matches?.(CHAT_FRAME_SELECTOR) ||
                    node.querySelector?.(CHAT_FRAME_SELECTOR)
                )
            );
        });
    }

    function start() {
        if (parentObserver || typeof MutationObserver !== 'function') {
            collectChatRoots().forEach(observeRoot);
            collectChatRoots().forEach(scanRoot);
            return;
        }

        parentObserver = new MutationObserver(mutations => {
            if (!hasChatFrameMutation(mutations)) return;
            collectChatRoots().forEach(observeRoot);
        });
        parentObserver.observe(document.documentElement, { childList: true, subtree: true });
        collectChatRoots().forEach(observeRoot);
    }

    function stop() {
        parentObserver?.disconnect?.();
        parentObserver = null;
        observedRoots.forEach(observer => observer.disconnect?.());
        observedRoots = new Map();
        pendingScanTimers.forEach(timer => clearTimeout(timer));
        pendingScanTimers.clear();
        openingControls = new WeakSet();
        pendingActions = new WeakSet();
    }

    function setEnabled(nextEnabled) {
        enabled = nextEnabled === true;
        if (enabled) start();
        else stop();
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get({ [SETTING_KEY]: true }, settings => {
            setEnabled(settings?.[SETTING_KEY] !== false);
        });

        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            setEnabled(changes[SETTING_KEY].newValue !== false);
        });
    }

    window.moeChatMediaAutoSelectFeature = {
        initialize,
        scan: () => collectChatRoots().forEach(scanRoot),
        getCampaignMediaType
    };
})();
