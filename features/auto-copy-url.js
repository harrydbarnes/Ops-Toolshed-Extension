(function() {
    'use strict';

    let listenerAttached = false;
    let initialized = false;
    let cueTrackingStarted = false;
    let isEnabled = true;
    let urlMode = 'short';
    let ignoreNextTrigger = false;
    const linkIcons = new Set();
    const cueObservedRoots = new WeakSet();
    const pendingCueRoots = new Set();
    let cueRefreshScheduled = false;

    // Prisma renders the campaign link control through a small, known set of
    // custom elements.  Keep discovery inside those hosts instead of walking
    // every element on the page (and every unrelated Shadow DOM tree).
    const KNOWN_CUE_HOST_SELECTOR = [
        'mo-banner',
        'mo-popover',
        'mo-banner-widget',
        'mo-icon[name="link"]',
        'mo-input',
        'input',
        'mo-button.copy-button'
    ].join(',');
    const KNOWN_CUE_ELEMENT_SELECTOR = [
        'mo-banner',
        'mo-popover',
        'mo-banner-widget',
        'mo-icon[name="link"]',
        'mo-input',
        'input',
        'mo-button.copy-button'
    ].join(',');

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.autoCopyUrlEnabled) {
            isEnabled = changes.autoCopyUrlEnabled.newValue !== false;
            applyKnownLinkIconCues();
        }
        if (area === 'sync' && changes.autoCopyUrlMode) {
            urlMode = changes.autoCopyUrlMode.newValue === 'full' ? 'full' : 'short';
        }
    });

    function getText(element) {
        return (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function queryKnownDeep(selector, root = document) {
        const results = [];
        const seenRoots = new Set();
        const seenElements = new Set();

        const visit = currentRoot => {
            if (!currentRoot || seenRoots.has(currentRoot)) return;
            seenRoots.add(currentRoot);

            if (currentRoot.nodeType === Node.ELEMENT_NODE && currentRoot.matches?.(selector)) {
                seenElements.add(currentRoot);
                results.push(currentRoot);
            }

            currentRoot.querySelectorAll?.(selector).forEach(element => {
                if (seenElements.has(element)) return;
                seenElements.add(element);
                results.push(element);
            });

            if (currentRoot.shadowRoot) visit(currentRoot.shadowRoot);
            currentRoot.querySelectorAll?.(KNOWN_CUE_HOST_SELECTOR).forEach(host => {
                if (host.shadowRoot) visit(host.shadowRoot);
            });
        };

        visit(root);
        return results;
    }

    function queryAllDeep(root = document) {
        return queryKnownDeep(KNOWN_CUE_ELEMENT_SELECTOR, root);
    }

    function isWithinPageLinkPopover(element) {
        let current = element;
        const visited = new Set();
        while (current && !visited.has(current)) {
            visited.add(current);
            if (current.matches?.('mo-popover')) return true;
            current = current.parentElement || current.getRootNode?.().host || null;
        }
        return false;
    }

    function waitForDeepElement(predicate, timeout = 5000, description = 'element') {
        return new Promise((resolve, reject) => {
            const intervalTime = 100;
            const startedAt = Date.now();

            const interval = setInterval(() => {
                const element = queryKnownDeep(KNOWN_CUE_ELEMENT_SELECTOR).find(predicate);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                    return;
                }

                if (Date.now() - startedAt >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`${description} not found within ${timeout}ms`));
                }
            }, intervalTime);
        });
    }

    function clickElement(element) {
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const view = element.ownerDocument?.defaultView || window;
        const clientX = rect.left + Math.min(Math.max(rect.width / 2, 8), rect.width - 1);
        const clientY = rect.top + Math.min(Math.max(rect.height / 2, 8), rect.height - 1);
        const baseOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            button: 0,
            view
        };

        if (view.PointerEvent) {
            element.dispatchEvent(new view.PointerEvent('pointerdown', {
                ...baseOptions,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }

        element.dispatchEvent(new view.MouseEvent('mousedown', { ...baseOptions, buttons: 1 }));

        if (view.PointerEvent) {
            element.dispatchEvent(new view.PointerEvent('pointerup', {
                ...baseOptions,
                buttons: 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }

        element.dispatchEvent(new view.MouseEvent('mouseup', { ...baseOptions, buttons: 0 }));
        element.dispatchEvent(new view.MouseEvent('click', { ...baseOptions, buttons: 0 }));
    }

    function isVisible(element) {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isPageLinkTriggerClick(event) {
        const path = event.composedPath ? event.composedPath() : [];
        const clickedBanner = path.some(element => element?.tagName === 'MO-BANNER');
        const clickedLinkControl = path.some(element => {
            if (element?.tagName === 'MO-ICON' && element.getAttribute?.('name') === 'link') {
                return true;
            }

            if (element?.tagName !== 'MO-POPOVER' && element?.tagName !== 'MO-BANNER-WIDGET') {
                return false;
            }

            return queryKnownDeep('mo-icon[name="link"]', element).some(descendant =>
                descendant.tagName === 'MO-ICON' && descendant.getAttribute('name') === 'link'
            );
        });

        return clickedBanner && clickedLinkControl;
    }

    function registerLinkIcon(element) {
        if (element?.tagName !== 'MO-ICON' || element.getAttribute('name') !== 'link') return;
        if (!isWithinPageLinkPopover(element)) return;
        linkIcons.add(element);
        element.classList.toggle('auto-copy-icon', isEnabled);
    }

    function inspectCueRoot(root) {
        if (!root) return;
        if (root.nodeType === Node.ELEMENT_NODE) registerLinkIcon(root);
        if (!root.querySelectorAll) return;

        queryKnownDeep('mo-icon[name="link"]', root).forEach(registerLinkIcon);
        root.querySelectorAll?.(KNOWN_CUE_HOST_SELECTOR).forEach(element => {
            if (element.shadowRoot) observeCueRoot(element.shadowRoot);
        });
        if (root.shadowRoot) observeCueRoot(root.shadowRoot);
    }

    function applyKnownLinkIconCues() {
        linkIcons.forEach(icon => {
            const isPageLinkIcon = icon.tagName === 'MO-ICON' &&
                icon.getAttribute('name') === 'link' &&
                isWithinPageLinkPopover(icon);
            if (!icon.isConnected || !isPageLinkIcon) {
                icon.classList.remove('auto-copy-icon');
                linkIcons.delete(icon);
                return;
            }
            icon.classList.toggle('auto-copy-icon', isEnabled);
        });
    }

    function flushCueRoots() {
        cueRefreshScheduled = false;
        pendingCueRoots.forEach(inspectCueRoot);
        pendingCueRoots.clear();
        applyKnownLinkIconCues();
    }

    function scheduleCueRefresh() {
        if (cueRefreshScheduled) return;
        cueRefreshScheduled = true;
        const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        schedule(flushCueRoots);
    }

    function handleCueMutations(records) {
        records.forEach(record => {
            if (record.type === 'attributes') {
                record.target.classList?.remove('auto-copy-icon');
                pendingCueRoots.add(record.target);
            }
            record.addedNodes?.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    pendingCueRoots.add(node);
                }
            });
        });
        scheduleCueRefresh();
    }

    function observeCueRoot(root) {
        if (!root?.querySelectorAll || cueObservedRoots.has(root)) return;
        cueObservedRoots.add(root);
        const observer = new MutationObserver(handleCueMutations);
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['name']
        });
        inspectCueRoot(root);
    }

    function startLinkIconCueTracking() {
        if (cueTrackingStarted || !document.documentElement) return;
        cueTrackingStarted = true;
        observeCueRoot(document.documentElement);
    }

    function findPageLinkValue() {
        const pageLinkInput = queryKnownDeep('mo-input, input').find(element =>
            (element.tagName === 'MO-INPUT' || element.tagName === 'INPUT') &&
            /^https:\/\/tiny\.mediaocean\.com\//i.test(element.value || element.getAttribute?.('value') || '')
        );

        return pageLinkInput?.value || pageLinkInput?.getAttribute?.('value') || '';
    }

    function findPageLinkPanel() {
        const pageLinkInput = queryKnownDeep('mo-input, input').find(element =>
            (element.tagName === 'MO-INPUT' || element.tagName === 'INPUT') &&
            /^https:\/\/tiny\.mediaocean\.com\//i.test(element.value || element.getAttribute?.('value') || '')
        );
        if (!pageLinkInput) return null;

        let candidate = pageLinkInput;
        while (candidate && candidate !== document.documentElement) {
            const containsCopyButton = queryKnownDeep('mo-button.copy-button', candidate).some(element =>
                element.tagName === 'MO-BUTTON' &&
                element.classList.contains('copy-button') &&
                /^Copy$/i.test(getText(element))
            );
            if (containsCopyButton) return candidate;
            candidate = candidate.parentElement || candidate.getRootNode?.().host || null;
        }

        return null;
    }

    function suppressPageLinkPanel() {
        let active = true;
        let animationFrameId = null;
        const hiddenPanels = new Set();
        const scheduleFrame = window.requestAnimationFrame
            ? window.requestAnimationFrame.bind(window)
            : callback => setTimeout(callback, 16);
        const cancelFrame = window.cancelAnimationFrame
            ? window.cancelAnimationFrame.bind(window)
            : clearTimeout;

        const hidePanel = () => {
            const panel = findPageLinkPanel();
            if (panel && !hiddenPanels.has(panel)) {
                panel.style.setProperty('visibility', 'hidden', 'important');
                hiddenPanels.add(panel);
            }
        };

        const hideBeforePaint = () => {
            if (!active) return;
            hidePanel();
            animationFrameId = scheduleFrame(hideBeforePaint);
        };

        hidePanel();
        animationFrameId = scheduleFrame(hideBeforePaint);

        return () => {
            active = false;
            if (animationFrameId !== null) cancelFrame(animationFrameId);
            hiddenPanels.forEach(panel => panel.style.removeProperty('visibility'));
        };
    }

    async function copyWithExtensionClipboard(pageLink) {
        const response = await chrome.runtime.sendMessage({
            action: 'copyCampaignUrlToClipboard',
            text: pageLink
        });

        if (response?.status !== 'success') {
            throw new Error(response?.message || 'Clipboard service did not confirm the copy.');
        }
    }

    function showCopiedToast() {
        utils.showToast('Campaign URL copied to clipboard!', 'success');
        document.getElementById('ops-toolshed-toast')?.classList.add('toast-offset-native');
    }

    async function copyFullUrl() {
        try {
            await copyWithExtensionClipboard(window.location.href);
            showCopiedToast();
        } catch (error) {
            console.error('Failed to copy the full campaign URL', error);
        }
    }

    function closePageLinkPopover() {
        const linkIcon = queryKnownDeep('mo-icon[name="link"]').find(element =>
            element.tagName === 'MO-ICON' &&
            element.getAttribute('name') === 'link' &&
            isWithinPageLinkPopover(element)
        );
        if (!linkIcon) return;

        ignoreNextTrigger = true;
        clickElement(linkIcon);
        setTimeout(() => {
            ignoreNextTrigger = false;
        }, 0);
    }

    async function clickNativeCopyButton() {
        const copyButton = await waitForDeepElement(
            element =>
                element.tagName === 'MO-BUTTON' &&
                element.classList.contains('copy-button') &&
                /^Copy$/i.test(getText(element)) &&
                isVisible(element),
            7000,
            'Page link Copy button'
        );

        clickElement(copyButton);
        return findPageLinkValue();
    }

    async function automateCopyFromPopover(stopSuppressingPanel = () => {}) {
        try {
            await clickNativeCopyButton();
            showCopiedToast();
        } catch (error) {
            const pageLink = findPageLinkValue();
            if (pageLink) {
                try {
                    await copyWithExtensionClipboard(pageLink);
                    showCopiedToast();
                    closePageLinkPopover();
                    return;
                } catch (clipboardError) {
                    console.error('Failed to copy campaign URL from page link input', clipboardError);
                }
            }

            console.error('Failed to auto-copy campaign URL', error);
        } finally {
            setTimeout(stopSuppressingPanel, 500);
        }
    }

    function handleAutoCopy() {
        if (listenerAttached) return;

        document.addEventListener('click', (event) => {
            if (ignoreNextTrigger) {
                ignoreNextTrigger = false;
                return;
            }
            if (!isEnabled || !isPageLinkTriggerClick(event)) return;

            if (urlMode === 'full') {
                event.preventDefault();
                event.stopImmediatePropagation();
                copyFullUrl();
                return;
            }

            const stopSuppressingPanel = suppressPageLinkPanel();

            setTimeout(() => {
                automateCopyFromPopover(stopSuppressingPanel);
            }, 0);
        }, true);

        listenerAttached = true;
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        chrome.storage.sync.get(['autoCopyUrlEnabled', 'autoCopyUrlMode'], (data) => {
            isEnabled = data.autoCopyUrlEnabled !== false;
            urlMode = data.autoCopyUrlMode === 'full' ? 'full' : 'short';
            startLinkIconCueTracking();
            handleAutoCopy();
        });
    }

    window.autoCopyUrlFeature = {
        initialize,
        handleAutoCopy,
        _test: {
            isPageLinkTriggerClick,
            queryAllDeep,
            findPageLinkValue,
            showCopiedToast,
            findPageLinkPanel,
            applyKnownLinkIconCues,
            getTrackedLinkIconCount: () => linkIcons.size
        }
    };

})();
