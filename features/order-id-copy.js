(function() {
    'use strict';

    // Inject styles for the toast and button animations
    const STYLE_ID = 'order-id-copy-styles';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .order-id-copy-toast {
                position: fixed;
                z-index: 2147483647;
                transform: translateX(-50%) translateY(-4px);
                padding: 6px 10px;
                border-radius: 4px;
                background: #333333;
                color: #ffffff;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                font: 13px/18px Arial, sans-serif;
                max-width: calc(100vw - 24px);
                box-sizing: border-box;
                text-align: center;
                white-space: normal;
                pointer-events: none;
                visibility: hidden;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease, visibility 0s 0.2s;
            }
            .order-id-copy-toast::before {
                content: '';
                position: absolute;
                top: -5px;
                left: 50%;
                transform: translateX(-50%);
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-bottom: 5px solid #333333;
            }
            .order-id-copy-toast.show {
                visibility: visible;
                opacity: 1;
                transform: translateX(-50%) translateY(0);
                transition-delay: 0s;
            }
            .order-id-copy-cell {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .order-id-copy-btn {
                --btn-bg: #f0f0f0;
                --btn-border-color: #ccc;
                --btn-text-color: #333;
                --btn-hover-bg: #e0e0e0;
                --btn-hover-border-color: #bbb;
                --btn-copied-bg: #ff3d80; /* Default Pink */
                --btn-copied-text-color: #fff;

                padding: 2px 6px;
                font-size: 10px;
                cursor: pointer;
                background-color: var(--btn-bg);
                border: 1px solid var(--btn-border-color);
                border-radius: 3px;
                color: var(--btn-text-color);
                line-height: normal;
                white-space: nowrap; /* Prevent button text wrapping */
                transition: background-color 0.2s, color 0.2s, border-color 0.2s; /* Smooth transition */
            }
            /* Theme Override for Button */
            body.ui-theme-black .order-id-copy-btn {
                --btn-copied-bg: #333;
            }
            /* Button hover effect */
            .order-id-copy-btn:hover {
                background-color: var(--btn-hover-bg);
                border-color: var(--btn-hover-border-color);
            }
            .order-id-copy-btn.copied {
                background-color: var(--btn-copied-bg);
                color: var(--btn-copied-text-color);
            }
            .ops-order-email-copy-btn {
                margin-left: 8px;
                vertical-align: middle;
            }
            td[id^="orderRecipients-"]:has(> .ops-order-email-copy-btn) > div {
                display: inline-block;
                width: calc(100% - 62px);
                vertical-align: middle;
            }
            #cm-buy-sidebar-nav-list [id$="-order-header"] > .mo-nav-list-item-content {
                cursor: pointer;
            }
            #cm-buy-sidebar-nav-list [id$="-order-header"] > .mo-nav-list-item-content.copied {
                color: #ff3d80;
            }
            body.ui-theme-black
                #cm-buy-sidebar-nav-list [id$="-order-header"] > .mo-nav-list-item-content.copied {
                color: #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    let toastTimeout;
    let currentToast = null;
    let sidebarCopyListenerAttached = false;
    let featureEnabled = true;

    function showToast(message, target) {
        clearTimeout(toastTimeout);
        if (!currentToast) {
            currentToast = document.createElement('div');
            currentToast.className = 'order-id-copy-toast';
            document.body.appendChild(currentToast);
            // Trigger reflow/wait for append
            setTimeout(() => {
                if(currentToast) currentToast.classList.add('show');
            }, 10);
        } else {
             currentToast.classList.add('show');
        }
        currentToast.textContent = message;
        const rect = target?.getBoundingClientRect?.();
        if (rect) {
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const toastWidth = currentToast.getBoundingClientRect?.().width || 0;
            const targetCenter = rect.left + (rect.width / 2);
            const minCenter = (toastWidth / 2) + 12;
            const maxCenter = viewportWidth - (toastWidth / 2) - 12;
            const centeredLeft = viewportWidth > 0 && toastWidth > 0
                ? Math.min(Math.max(targetCenter, minCenter), Math.max(minCenter, maxCenter))
                : targetCenter;
            currentToast.style.left = `${centeredLeft}px`;
            currentToast.style.top = `${rect.bottom + 8}px`;
        }
        toastTimeout = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            setTimeout(() => {
                if (currentToast && currentToast.parentElement && !currentToast.classList.contains('show')) {
                    document.body.removeChild(currentToast);
                    currentToast = null;
                }
            }, 500);
        }
    }

    function cleanOrderId(orderId) {
        // Remove suffix starting with -R
        // e.g. O-5YWFK-R0 -> O-5YWFK
        return orderId.split('-R')[0];
    }

    function handleCopy(button, orderIdText) {
        if (!featureEnabled) return;
        const cleanedId = cleanOrderId(orderIdText);
        chrome.runtime.sendMessage({
            action: 'copyOrderIdToClipboard',
            text: cleanedId
        }).then(response => {
            if (response?.status !== 'success') {
                throw new Error(response?.message || 'Clipboard service did not confirm the copy.');
            }
            showToast('Order ID Copied to Clipboard!', button);

            // Visual feedback on legacy buttons and new-UI sidebar IDs.
            const isButton = button.matches('.order-id-copy-btn');
            const originalText = isButton ? button.textContent : null;

            if (isButton) button.textContent = 'Copied!';
            button.classList.add('copied');

            setTimeout(() => {
                if (isButton) button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);

        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('Failed to copy Order ID', button);
        });
    }

    function isOrderSummaryRoute() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const pspId = params.get('osPspId');
        return window.location.href.includes('=prsm-cm-ord&campaign-id=') || (
            Boolean(params.get('campaign-id')) &&
            pspId === 'prsm-cm-plan-to-buy' &&
            params.get('ptb-ctx') === 'orderSummary'
        );
    }

    function isBuyOrdersRoute() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        return Boolean(params.get('campaign-id')) &&
            params.get('ptb-mod') === 'buy' &&
            params.get('ptb-ctx') !== 'actualize' &&
            params.get('route') !== 'actualize';
    }

    function isOrdersSidebarRoute() {
        return isOrderSummaryRoute() || isBuyOrdersRoute();
    }

    function isNewOrderUi() {
        return Boolean(document.querySelector(
            '#cm-buy-sidebar-order-revisions-header .mo-nav-list-item-accessory-content mo-menu'
        ));
    }

    function getNewUiOrderIdTarget(eventTarget) {
        const content = eventTarget?.closest?.('.mo-nav-list-item-content');
        const header = content?.parentElement;
        if (
            !content ||
            !header?.matches?.('#cm-buy-sidebar-nav-list [id$="-order-header"]')
        ) {
            return null;
        }

        const orderId = content.textContent.trim();
        return /^O-[A-Z0-9]+$/i.test(orderId) ? { content, orderId } : null;
    }

    function handleNewUiSidebarClick(event) {
        if (!featureEnabled || !event.isTrusted) return;
        const target = getNewUiOrderIdTarget(event.target);
        if (!target || !isOrdersSidebarRoute() || !isNewOrderUi()) return;

        event.preventDefault();
        event.stopPropagation();
        handleCopy(target.content, target.orderId);
    }

    function ensureNewUiSidebarCopyListener() {
        if (sidebarCopyListenerAttached) return;
        sidebarCopyListenerAttached = true;
        document.addEventListener('click', handleNewUiSidebarClick);
    }

    function removeLegacyCopyControls() {
        document.querySelectorAll('.order-id-copy-cell').forEach(cell => {
            cell.querySelector('.order-id-copy-btn')?.remove();
            cell.classList.remove('order-id-copy-cell');
        });
    }

    function checkAndAddCopyButtons() {
        ensureNewUiSidebarCopyListener();
        reconcileEmailCopyButtons();
        if (!isOrderSummaryRoute()) {
            return;
        }
        if (isNewOrderUi()) {
            removeLegacyCopyControls();
            return;
        }

        // Selector: <td class="pad"> containing <a> with potential Order ID
        const cells = document.querySelectorAll('td.pad');
        cells.forEach(cell => {
             const link = cell.querySelector('a');
             if (link) {
                 const text = link.textContent.trim();

                 // Check if it looks like an Order ID (O-xxxxx-Rx)
                 // And check if we haven't already added the button to this cell
                 if (/^O-[\w]+-R\d+$/.test(text) && !cell.querySelector('.order-id-copy-btn')) {

                     // Apply flexbox via class to the parent cell to push button to the far right
                     cell.classList.add('order-id-copy-cell');

                     const copyBtn = document.createElement('button');
                     copyBtn.textContent = 'Copy';
                     copyBtn.className = 'order-id-copy-btn';
                     copyBtn.title = 'Copy Clean Order ID';

                     copyBtn.addEventListener('click', (e) => {
                         if (!e.isTrusted) return;
                         e.preventDefault();
                         e.stopPropagation();
                         handleCopy(copyBtn, text);
                     });

                     // Append directly to the cell, so it sits as a flex sibling to the link
                     cell.appendChild(copyBtn);
                 }
             }
        });
    }

    function getRecipientEmails(cell) {
        const content = cell.cloneNode(true);
        content.querySelectorAll('.ops-order-email-copy-btn').forEach(button => button.remove());
        const sources = [content.textContent, ...Array.from(content.querySelectorAll('[data-full-text]'),
            element => element.getAttribute('data-full-text'))];
        const seen = new Set();
        return sources.flatMap(text => text?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi) || [])
            .filter(email => {
                const key = email.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function reconcileEmailCopyButtons() {
        const active = featureEnabled && isOrderSummaryRoute() && isNewOrderUi();
        document.querySelectorAll('.ops-order-email-copy-btn').forEach(button => {
            if (!active || !getRecipientEmails(button.closest('td')).length) button.remove();
        });
        if (!active) return;
        document.querySelectorAll('td[id^="orderRecipients-"]').forEach(cell => {
            if (!getRecipientEmails(cell).length || cell.querySelector('.ops-order-email-copy-btn')) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'order-id-copy-btn ops-order-email-copy-btn';
            button.textContent = 'Copy';
            button.title = 'Copy all email addresses in this row';
            button.setAttribute('aria-label', button.title);
            button.addEventListener('click', event => {
                if (!event.isTrusted || !featureEnabled || !isOrderSummaryRoute() || !isNewOrderUi()) return;
                event.preventDefault();
                event.stopPropagation();
                const emails = getRecipientEmails(cell);
                if (!emails.length) return;
                chrome.runtime.sendMessage({ action: 'copyOrderEmailsToClipboard', text: emails.join('; ') })
                    .then(response => {
                        if (response?.status !== 'success') throw new Error('Clipboard copy failed');
                        showToast('Email addresses copied to clipboard!', button);
                        button.textContent = 'Copied!';
                        button.classList.add('copied');
                        setTimeout(() => {
                            button.textContent = 'Copy';
                            button.classList.remove('copied');
                        }, 2000);
                    }).catch(() => showToast('Failed to copy email addresses', button));
            });
            cell.appendChild(button);
        });
    }

    function initialize() {
        // Fetch 'uiTheme' alongside 'orderIdCopyEnabled'
        chrome.storage.sync.get(['orderIdCopyEnabled', 'uiTheme'], (data) => {
            // Apply the theme class to the body
            if (data.uiTheme === 'black') {
                document.body.classList.add('ui-theme-black');
            } else {
                document.body.classList.remove('ui-theme-black');
            }

            if (data.orderIdCopyEnabled !== false) {
                 featureEnabled = true;
                 checkAndAddCopyButtons();
            } else {
                 featureEnabled = false;
            }
        });

        // Listen for changes to the theme setting to update dynamically
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.uiTheme) {
                if (changes.uiTheme.newValue === 'black') {
                    document.body.classList.add('ui-theme-black');
                } else {
                    document.body.classList.remove('ui-theme-black');
                }
            }
            if (namespace === 'sync' && changes.orderIdCopyEnabled) {
                featureEnabled = changes.orderIdCopyEnabled.newValue !== false;
                if (featureEnabled) checkAndAddCopyButtons();
                else {
                    removeLegacyCopyControls();
                    reconcileEmailCopyButtons();
                }
            }
        });
    }

    window.orderIdCopyFeature = {
        initialize,
        checkAndAddCopyButtons,
        isOrderSummaryRoute,
        isOrdersSidebarRoute,
        isNewOrderUi,
        getNewUiOrderIdTarget
    };
})();
