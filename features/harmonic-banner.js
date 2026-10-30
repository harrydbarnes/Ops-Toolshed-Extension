(() => {
    const selector = '.hs-banner[data-harmonic-security-root="true"]:has(.advise-banner)';
    const storageKey = 'harmonicAdviceAcknowledgedAt';
    const week = 7 * 24 * 60 * 60 * 1000;
    const observed = new WeakSet();
    const pendingStyles = new WeakSet();
    const stylesReady = new WeakSet();
    let acknowledgedAt = 0;
    let ready = false;
    let dismissedThisPage = false;

    const isCurrent = () => Number.isFinite(acknowledgedAt) && acknowledgedAt > 0 && Date.now() >= acknowledgedAt && Date.now() - acknowledgedAt < week;

    function waitForStyles(banner) {
        if (stylesReady.has(banner)) return false;
        const links = [...(banner.parentElement?.querySelectorAll('link[rel="stylesheet"][href^="chrome-extension:"]') || [])];
        const pending = links.filter(link => !link.sheet);
        if (!pending.length) return false;
        if (pendingStyles.has(banner)) return true;
        pendingStyles.add(banner);
        let remaining = pending.length;
        let finished = false;
        let timeout;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            pending.forEach(link => {
                link.removeEventListener('load', onSettled);
                link.removeEventListener('error', onSettled);
            });
            stylesReady.add(banner);
            if (banner.isConnected) processBanner(banner);
        };
        const onSettled = () => { if (--remaining <= 0) finish(); };
        pending.forEach(link => {
            link.addEventListener('load', onSettled, { once: true });
            link.addEventListener('error', onSettled, { once: true });
        });
        timeout = setTimeout(finish, 2000);
        return true;
    }

    function processBanner(banner) {
        if (!ready) return;
        if (dismissedThisPage) return;
        if (isCurrent()) {
            if (banner.style.getPropertyValue('display') !== 'none' || banner.style.getPropertyPriority('display') !== 'important') {
                banner.style.setProperty('display', 'none', 'important');
            }
            return;
        }
        const action = banner.querySelector('.action');
        const dismiss = action?.querySelector('[data-testid="dismiss"]');
        if (!dismiss) return;
        if (waitForStyles(banner)) {
            if (banner.style.getPropertyValue('display') !== 'none' || banner.style.getPropertyPriority('display') !== 'important') {
                banner.style.setProperty('display', 'none', 'important');
            }
            return;
        }
        if (banner.style.getPropertyValue('display') !== 'block' || banner.style.getPropertyPriority('display') !== 'important') {
            banner.style.setProperty('display', 'block', 'important');
        }
        if (action.querySelector('[data-ops-harmonic-ack]')) return;
        action.style.setProperty('display', 'flex');
        action.style.setProperty('flex-direction', 'column');
        action.style.setProperty('align-items', 'center');
        action.style.setProperty('gap', '8px');
        action.style.setProperty('flex-shrink', '0');
        action.style.setProperty('width', 'min(235px, 40vw)');
        action.style.setProperty('align-self', 'stretch');
        action.style.setProperty('justify-content', 'center');
        const label = document.createElement('label');
        label.setAttribute('data-ops-harmonic-ack', '');
        label.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;margin:0;max-width:100%;color:inherit;font-size:12px;line-height:1.3;text-align:center;';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = true;
        const text = document.createElement('span');
        const acknowledgement = 'I agree to follow this guidance.';
        text.textContent = acknowledgement;
        label.append(checkbox, text);
        action.insertBefore(label, dismiss);
        dismiss.disabled = true;
        dismiss.style.setProperty('background-image', 'linear-gradient(to right, var(--primary-brand-color, #000050) 50%, #8c8c9c 50%)');
        dismiss.style.setProperty('background-size', '200% 100%');
        dismiss.style.setProperty('background-position', '100% 0');
        dismiss.style.setProperty('transition', 'background-position 3s linear, opacity 200ms ease');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (dismiss.isConnected) dismiss.style.setProperty('background-position', '0 0');
        }));
        const countdown = setTimeout(() => {
            checkbox.disabled = false;
            dismiss.disabled = false;
            dismiss.style.removeProperty('background-image');
            dismiss.style.removeProperty('background-size');
            dismiss.style.removeProperty('background-position');
        }, 3000);
        let completing = false;
        dismiss.addEventListener('click', event => {
            if (completing || !event.isTrusted) return;
            clearTimeout(countdown);
            dismissedThisPage = true;
            if (!checkbox.checked) {
                banner.style.removeProperty('display');
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            dismiss.disabled = true;
            const now = Date.now();
            chrome.storage.local.set({ [storageKey]: now }, () => {
                if (chrome.runtime.lastError) {
                    dismissedThisPage = false;
                    dismiss.disabled = false;
                    text.textContent = 'Could not save acknowledgement. Please try again.';
                    return;
                }
                acknowledgedAt = now;
                label.style.transition = 'opacity 180ms ease';
                label.style.opacity = '0';
                dismiss.style.opacity = '0';
                setTimeout(() => {
                    checkbox.hidden = true;
                    dismiss.hidden = true;
                    dismiss.style.setProperty('display', 'none', 'important');
                    text.textContent = 'Dismissing shortly. You will have to acknowledge this weekly.';
                    label.style.opacity = '1';
                    setTimeout(() => {
                        banner.style.transition = 'opacity 250ms ease';
                        banner.style.opacity = '0';
                        setTimeout(() => {
                            banner.style.removeProperty('display');
                            completing = true;
                            dismiss.disabled = false;
                            dismiss.click();
                        }, 250);
                    }, 5000);
                }, 180);
            });
        }, true);
    }

    function scan(root) {
        if (!root || observed.has(root)) return;
        observed.add(root);
        function inspect(node) {
            if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
            const banner = node.closest?.(selector);
            if (banner) processBanner(banner);
            node.querySelectorAll?.(selector).forEach(processBanner);
            if (node.shadowRoot) scan(node.shadowRoot);
            node.querySelectorAll?.('*').forEach(element => { if (element.shadowRoot) scan(element.shadowRoot); });
        }
        inspect(root);
        new MutationObserver(records => records.forEach(record => {
            if (record.type === 'attributes') inspect(record.target);
            else record.addedNodes.forEach(inspect);
        })).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }

    chrome.storage.local.get({ [storageKey]: 0 }, result => {
        if (!chrome.runtime.lastError) acknowledgedAt = Number(result[storageKey]);
        ready = true;
        scan(document);
    });
})();
