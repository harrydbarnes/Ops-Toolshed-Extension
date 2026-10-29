(() => {
    const selector = '.hs-banner[data-harmonic-security-root="true"]:has(.advise-banner)';
    const storageKey = 'harmonicAdviceAcknowledgedAt';
    const week = 7 * 24 * 60 * 60 * 1000;
    const observed = new WeakSet();
    let acknowledgedAt = 0;
    let ready = false;
    let dismissedThisPage = false;

    const isCurrent = () => Number.isFinite(acknowledgedAt) && acknowledgedAt > 0 && Date.now() >= acknowledgedAt && Date.now() - acknowledgedAt < week;

    function processBanner(banner) {
        if (!ready) return;
        if (isCurrent()) {
            if (banner.style.getPropertyValue('display') !== 'none' || banner.style.getPropertyPriority('display') !== 'important') {
                banner.style.setProperty('display', 'none', 'important');
            }
            return;
        }
        if (dismissedThisPage) return;
        const action = banner.querySelector('.action');
        const dismiss = action?.querySelector('[data-testid="dismiss"]');
        if (!dismiss) return;
        if (banner.style.getPropertyValue('display') !== 'block' || banner.style.getPropertyPriority('display') !== 'important') {
            banner.style.setProperty('display', 'block', 'important');
        }
        if (action.querySelector('[data-ops-harmonic-ack]')) return;
        const label = document.createElement('label');
        label.setAttribute('data-ops-harmonic-ack', '');
        label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;color:inherit;font-size:14px;';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = true;
        const text = document.createElement('span');
        const acknowledgement = 'I acknowledge that I will follow this guidance.';
        let secondsLeft = 3;
        text.textContent = `${acknowledgement} (${secondsLeft}s)`;
        label.append(checkbox, text);
        const countdown = setInterval(() => {
            if (!label.isConnected) {
                clearInterval(countdown);
                return;
            }
            secondsLeft--;
            if (secondsLeft > 0) {
                text.textContent = `${acknowledgement} (${secondsLeft}s)`;
            } else {
                clearInterval(countdown);
                checkbox.disabled = false;
                text.textContent = acknowledgement;
            }
        }, 1000);
        action.insertBefore(label, dismiss);
        dismiss.addEventListener('click', event => {
            if (!event.isTrusted) return;
            clearInterval(countdown);
            dismissedThisPage = true;
            banner.style.removeProperty('display');
            if (!checkbox.checked) return;
            const now = Date.now();
            chrome.storage.local.set({ [storageKey]: now }, () => {
                if (!chrome.runtime.lastError) acknowledgedAt = now;
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
