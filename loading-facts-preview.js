(() => {
    'use strict';

    // Both onboarding and Settings render these same illustrations.
    function renderPreview(container, mode) {
        container.className = `facts-preview facts-preview-${mode}`;
        const fact = 'The first webcam was created to monitor a coffee pot at Cambridge University.';
        if (mode === 'old') {
            container.innerHTML = `<span class="facts-old-icon">⏳</span><span><b>DID YOU KNOW?</b><span class="facts-preview-message">${fact}</span></span><span class="facts-old-actions">? &nbsp;×</span>`;
        } else {
            container.innerHTML = `<span class="facts-preview-message">${fact}</span><span class="facts-preview-menu">•••</span>`;
        }
    }

    document.querySelectorAll('[data-loading-facts-preview]').forEach(element => renderPreview(element, element.dataset.loadingFactsPreview));
    const control = document.getElementById('loadingFactsUI');
    if (!control) return;
    const tooltip = document.createElement('div');
    tooltip.id = 'loading-facts-option-preview';
    tooltip.className = 'loading-facts-option-preview';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
    let active;
    function hide() {
        tooltip.hidden = true;
        if (active) active.removeAttribute('aria-describedby');
        active = null;
    }
    function position() {
        if (!active || tooltip.hidden) return;
        const rect = active.getBoundingClientRect();
        const bounds = tooltip.getBoundingClientRect();
        tooltip.style.left = `${Math.max(12, Math.min(rect.left + rect.width / 2 - bounds.width / 2, window.innerWidth - bounds.width - 12))}px`;
        tooltip.style.top = `${rect.bottom + 8 + bounds.height <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - bounds.height - 8)}px`;
    }
    function show(button) {
        if (active && active !== button) active.removeAttribute('aria-describedby');
        active = button;
        const preview = document.createElement('div');
        preview.setAttribute('aria-hidden', 'true');
        renderPreview(preview, button.dataset.value);
        tooltip.replaceChildren(preview);
        tooltip.setAttribute('aria-label', button.dataset.value === 'old' ? 'Old UI preview: dark floating message with visible feedback buttons' : 'New UI preview: subtle message with feedback in a menu');
        button.setAttribute('aria-describedby', tooltip.id);
        tooltip.hidden = false;
        position();
    }
    control.querySelectorAll('button[data-value]').forEach(button => {
        button.addEventListener('pointerenter', () => show(button));
        button.addEventListener('pointerleave', () => { if (document.activeElement !== button) hide(); });
        button.addEventListener('focus', () => show(button));
        button.addEventListener('blur', hide);
        button.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    });
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', hide, true);
})();
