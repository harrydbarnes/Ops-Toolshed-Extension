(function() {
    'use strict';

    if (window.campaignPoAutofillFeature) return;
    const SETTING_KEY = 'campaignPoAutofillEnabled';
    const PO_SELECTOR = '[id^="s2id_gwt-debug-bd-purchaseOrder"]';
    const TARGET_SELECTOR = '#gwt-debug-financialRefId0, #campaign-client-reference';
    const ownedValues = new WeakMap();
    let enabled = false;
    let ready = false;
    let observer = null;
    let queued = false;

    function isAddCampaign() {
        return window.location.pathname.startsWith('/idesk/prisma-campaign-details/') &&
            new URLSearchParams(window.location.search).get('osModalId') === 'prsm-cm-cmpadd';
    }

    function isActive() {
        return ready && enabled && isAddCampaign() &&
            window.opsToolshedExtensionState?.isActive?.() === true;
    }

    function getPoNumbers() {
        const numbers = [];
        document.querySelectorAll(`${PO_SELECTOR} .select2-search-choice > div`).forEach(choice => {
            // Selected line items show "PO number: description - dates".
            // Never use the hidden Select2 value: it contains internal IDs.
            if (choice.closest('[hidden], [style*="display: none"]')) return;
            const text = choice.textContent.trim();
            const number = text.split(':')[0].trim();
            if (number && !numbers.includes(number)) numbers.push(number);
        });
        return numbers.join('; ');
    }

    function apply() {
        if (!isActive()) return;
        const value = getPoNumbers();
        document.querySelectorAll(TARGET_SELECTOR).forEach(input => {
            if (input.disabled || input.readOnly) return;
            const previous = ownedValues.get(input);
            if (input.value && input.value !== previous) return;
            if (input.value === value) return;
            // Track ownership before events, which can synchronously rerender Prisma.
            ownedValues.set(input, value);
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    function scheduleApply() {
        if (!isActive() || queued) return;
        queued = true;
        window.queueMicrotask(() => {
            queued = false;
            apply();
        });
    }

    function handleChange(event) {
        if (event.target?.matches?.('[id^="gwt-debug-bd-purchaseOrder"]') ||
            event.target?.closest?.(PO_SELECTOR)) scheduleApply();
    }

    function reconcile() {
        if (!isActive()) {
            observer?.disconnect();
            observer = null;
            document.removeEventListener('change', handleChange);
            return;
        }
        if (!document.body) return;
        if (!observer) {
            observer = new MutationObserver(mutations => {
                const relevant = mutations.some(mutation =>
                    (mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement)?.closest?.(PO_SELECTOR) ||
                    (mutation.type === 'attributes' && mutation.target.querySelector?.(PO_SELECTOR)) ||
                    [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1 &&
                        (node.matches?.(`${PO_SELECTOR}, ${TARGET_SELECTOR}`) ||
                         node.querySelector?.(`${PO_SELECTOR}, ${TARGET_SELECTOR}`))));
                if (relevant) scheduleApply();
            });
            // This script runs only in the Campaign Details frame, never the grid.
            observer.observe(document.body, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeFilter: ['style', 'hidden']
            });
            document.addEventListener('change', handleChange);
        }
        apply();
    }

    window.campaignPoAutofillFeature = { apply, getPoNumbers };
    document.addEventListener('DOMContentLoaded', reconcile, { once: true });
    window.addEventListener('pagehide', () => observer?.disconnect());
    window.addEventListener('pageshow', () => { observer?.disconnect(); observer = null; reconcile(); });
    window.opsToolshedExtensionState?.subscribe?.(reconcile);
    try {
        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            if (chrome.runtime?.lastError) return;
            enabled = data?.[SETTING_KEY] !== false;
            ready = true;
            reconcile();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            enabled = changes[SETTING_KEY].newValue !== false;
            reconcile();
        });
    } catch (_error) {
        enabled = false;
    }
})();
