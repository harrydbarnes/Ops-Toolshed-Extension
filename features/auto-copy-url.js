(function() {
    'use strict';

    let listenerAttached = false;
    let isEnabled = true;

    chrome.storage.sync.get('autoCopyUrlEnabled', (data) => {
        isEnabled = data.autoCopyUrlEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.autoCopyUrlEnabled) {
            isEnabled = changes.autoCopyUrlEnabled.newValue !== false;
            updateLinkIconCue();
        }
    });

    function getText(element) {
        return (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function queryAllDeep(root = document) {
        const results = [];
        const visit = (currentRoot) => {
            if (!currentRoot?.querySelectorAll) return;

            currentRoot.querySelectorAll('*').forEach(element => {
                results.push(element);
                if (element.shadowRoot) visit(element.shadowRoot);
            });
        };

        visit(root);
        return results;
    }

    function waitForDeepElement(predicate, timeout = 5000, description = 'element') {
        return new Promise((resolve, reject) => {
            const intervalTime = 100;
            const startedAt = Date.now();

            const interval = setInterval(() => {
                const element = queryAllDeep().find(predicate);
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
        const clickedLinkIcon = path.some(element =>
            element?.tagName === 'MO-ICON' && element.getAttribute?.('name') === 'link'
        );
        const clickedBannerLinkPopover = path.some(element => element?.tagName === 'MO-POPOVER') &&
            path.some(element => element?.tagName === 'MO-BANNER');

        return clickedLinkIcon && clickedBannerLinkPopover;
    }

    function updateLinkIconCue() {
        queryAllDeep()
            .filter(element =>
                element.tagName === 'MO-ICON' &&
                element.getAttribute('name') === 'link' &&
                element.closest?.('mo-popover')
            )
            .forEach(icon => icon.classList.toggle('auto-copy-icon', isEnabled));
    }

    function findPageLinkValue() {
        const pageLinkInput = queryAllDeep().find(element =>
            (element.tagName === 'MO-INPUT' || element.tagName === 'INPUT') &&
            /^https:\/\/tiny\.mediaocean\.com\//i.test(element.value || element.getAttribute?.('value') || '')
        );

        return pageLinkInput?.value || pageLinkInput?.getAttribute?.('value') || '';
    }

    async function clickNativeCopyButton() {
        const copyButton = await waitForDeepElement(
            element =>
                element.tagName === 'MO-BUTTON' &&
                element.classList.contains('copy-button') &&
                /^Copy$/i.test(getText(element)) &&
                isVisible(element),
            5000,
            'Page link Copy button'
        );

        clickElement(copyButton);
        return findPageLinkValue();
    }

    async function automateCopyFromPopover() {
        try {
            const pageLink = await clickNativeCopyButton();
            utils.showToast(pageLink ? 'Campaign URL copied to clipboard!' : 'URL copied to clipboard!', 'success');
        } catch (error) {
            const pageLink = findPageLinkValue();
            if (pageLink) {
                try {
                    await navigator.clipboard.writeText(pageLink);
                    utils.showToast('Campaign URL copied to clipboard!', 'success');
                    return;
                } catch (clipboardError) {
                    console.error('Failed to copy campaign URL from page link input', clipboardError);
                }
            }

            console.error('Failed to auto-copy campaign URL', error);
        }
    }

    function handleAutoCopy() {
        updateLinkIconCue();

        if (listenerAttached) return;

        document.addEventListener('click', (event) => {
            if (!isEnabled || !isPageLinkTriggerClick(event)) return;

            setTimeout(() => {
                automateCopyFromPopover();
            }, 0);
        }, true);

        listenerAttached = true;
    }

    function initialize() {
        chrome.storage.sync.get('autoCopyUrlEnabled', (data) => {
            isEnabled = data.autoCopyUrlEnabled !== false;
            handleAutoCopy();
        });
    }

    window.autoCopyUrlFeature = {
        initialize,
        handleAutoCopy,
        _test: {
            isPageLinkTriggerClick,
            queryAllDeep,
            findPageLinkValue
        }
    };

})();
