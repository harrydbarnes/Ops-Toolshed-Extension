(function() {
    'use strict';
    const root = document.documentElement;
    const $ = id => document.getElementById(id);
    const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const enabled = () => root.dataset.recciesUi === 'v2';
    const tracks = new Map();
    const url = $('sheet-url'), read = $('refresh-sheet');
    const readHome = document.createComment('Original read button position');
    read.before(readHome);
    const joined = document.createElement('div'); joined.className = 'reccies-sheet-input';
    const chips = document.querySelector('.status-chips');
    const sourceMetadata = document.createElement('p'); sourceMetadata.className = 'v2-source-metadata hint';
    $('source-details').append(sourceMetadata);
    chips.setAttribute('aria-describedby', 'filter-hint');
    const quickClear = document.createElement('button');
    quickClear.type = 'button'; quickClear.id = 'clear-prisma-filters'; quickClear.className = 'prisma-filter-clear';
    quickClear.textContent = '×'; quickClear.hidden = true;
    quickClear.setAttribute('aria-label', 'Clear Prisma filters'); quickClear.title = 'Clear Prisma filters';
    chips.append(quickClear);
    quickClear.addEventListener('click', () => {
        const inputs = [...chips.querySelectorAll('[data-status]')];
        if (inputs.some(input => input.disabled)) return;
        inputs.forEach(input => { input.checked = false; });
        // Reuse the real filter handler, including preference persistence.
        inputs[0]?.dispatchEvent(new Event('change'));
        chips.querySelector('input')?.focus();
    });
    const mismatchLabel = chips.querySelector('[data-status="mismatch"]').parentElement;
    const mismatchText = [...mismatchLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    const originalMismatch = mismatchText?.textContent;
    function updateFilters() {
        sourceMetadata.textContent = $('source-status').textContent;
        chips.title = $('filter-hint').textContent;
        const inputs = [...chips.querySelectorAll('[data-status]')];
        const labels = [...chips.querySelectorAll('label')].filter(label => !label.hidden);
        const gap = parseFloat(window.getComputedStyle(chips).gap) || 7;
        const width = chips.clientWidth;
        const needed = labels.reduce((sum, label) => sum + label.getBoundingClientRect().width, 0) + gap * labels.length + 30;
        quickClear.disabled = inputs.some(input => input.disabled);
        // Do not create another line solely to fit the clear action.
        quickClear.hidden = !enabled() || !inputs.some(input => input.checked) || !width || Math.ceil(needed) > width;
    }
    function updateSegments(track) {
        if (!tracks.has(track)) {
            const indicator = document.createElement('span'); indicator.className = 'reccies-segment-indicator';
            indicator.setAttribute('aria-hidden', 'true'); track.prepend(indicator);
            tracks.set(track, indicator);
        }
        const indicator = tracks.get(track), selected = track.querySelector('button.is-selected');
        if (!selected || !enabled()) return;
        indicator.style.width = `${selected.offsetWidth}px`;
        indicator.style.transform = `translateX(${selected.offsetLeft}px)`;
    }
    function refreshLayout() { tracks.forEach((_, track) => updateSegments(track)); updateFilters(); }
    function apply(value) {
        root.dataset.recciesUi = value === false ? 'v1' : 'v2';
        if (enabled()) {
            if (!joined.isConnected) { url.before(joined); joined.append(url, read); }
            read.textContent = 'Read'; read.setAttribute('aria-label', 'Read Google Sheet');
        } else if (joined.isConnected) {
            joined.before(url); readHome.after(read); joined.remove(); read.textContent = 'Read Google Sheet';
        }
        if (mismatchText) mismatchText.textContent = enabled() ? 'Sheet / Prisma mismatch' : originalMismatch;
        refreshLayout();
        document.dispatchEvent(new Event('reccies-ui-change'));
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshLayout) : null;
    if (observer) {
        observer.observe(chips);
        document.querySelectorAll('.segmented-control').forEach(track => observer.observe(track));
    }
    window.addEventListener('resize', refreshLayout);
    document.fonts?.ready.then(refreshLayout);
    window.addEventListener('pagehide', () => observer?.disconnect(), {once:true});
    const human = value => String(value || 'Unknown').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, char => char.toUpperCase());
    function evidence(row, result, observed) {
        const line = document.createElement('div'); line.className = 'v2-evidence';
        const values = [...(observed ? [] : [['Tracker', row.reccied || 'Blank']]), ['Reconciled', result?.reconciled === '1' ? 'Yes' : result?.reconciled === '0' ? 'No' : '—'], ['Buy', result?.buyStatus ? human(result.buyStatus) : '—']];
        values.forEach(([label, value]) => {
            const part = document.createElement('span'), strong = document.createElement('strong');
            strong.textContent = value; part.append(`${label} `, strong); line.append(part);
        });
        return line;
    }
    function decorateCard(card, rows, checks, observed, grouped) {
        if (!enabled()) return;
        const bottom = card.querySelector('.card-bottom');
        if (grouped) {
            const placements = document.createElement('div'); placements.className = 'v2-placements';
            rows.forEach(row => {
                const item = document.createElement('div'); item.className = 'v2-placement';
                const id = document.createElement('p'); id.className = 'v2-placement-id'; id.textContent = row.dNumber;
                item.append(id, evidence(row, checks?.[row.sourceRow], observed)); placements.append(item);
            });
            bottom.before(placements);
        } else {
            const row = rows[0], result = checks?.[row.sourceRow];
            const metadata = document.createElement('p'); metadata.className = 'v2-entity-meta';
            metadata.textContent = [row.client, row.supplier].filter(Boolean).join(' · ');
            card.querySelectorAll(':scope > .supplier').forEach(node => node.classList.add('v2-original-entity'));
            card.querySelector('.campaign-name').after(metadata);
            card.querySelector('.status-lines').before(evidence(row, result, observed));
            const badge = card.querySelector('.card-top > .badge');
            if (badge && !row.issue && result?.state === 'ready') badge.textContent = 'Ready in Prisma';
            if (badge && !row.issue && result?.state === 'outstanding') badge.textContent = result.reconciled === '0' ? 'Not reconciled in Prisma' : `Buy status: ${human(result.buyStatus)}`;
        }
        const warnings = card.querySelectorAll('.mismatch-warning');
        warnings.forEach(warning => {
            const mismatches = rows.filter(row => row.reccied.toLowerCase() === 'yes' && checks?.[row.sourceRow]?.state === 'outstanding');
            const badge = warning.querySelector('.badge');
            if (badge) badge.textContent = mismatches.some(row => checks[row.sourceRow].reconciled === '0') ? 'Not reconciled in Prisma' : 'Yes in tracker, buy not successful';
        });
    }
    function reveal(details) {
        if (!enabled()) return false;
        const rect = details.getBoundingClientRect(), room = window.innerHeight - 16;
        if (rect.height && (rect.bottom > room || rect.top < 0)) {
            details.scrollIntoView?.({behavior:reduced() ? 'auto' : 'smooth',block:rect.height > room ? 'start' : 'end'});
        }
        return true;
    }
    function closeDialog(dialog, finish) {
        if (!enabled() || reduced()) return false;
        if (dialog.classList.contains('is-closing')) return true;
        dialog.classList.add('is-closing');
        let done = false;
        const complete = () => { if (done) return; done = true; clearTimeout(timer); dialog.removeEventListener('animationend', onEnd); finish(); };
        const onEnd = event => { if (event.target === dialog && event.animationName === 'reccies-dialog-out') complete(); };
        dialog.addEventListener('animationend', onEnd);
        const timer = setTimeout(complete, 180);
        return true;
    }
    window.reccieUi = {enabled, updateSegments, updateFilters, decorateCard, reveal, closeDialog};
    apply(true);
    Promise.resolve(chrome.storage.sync?.get({recciesV2Enabled:true})).then(settings => apply(settings?.recciesV2Enabled)).catch(() => {});
    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'sync' && changes.recciesV2Enabled) apply(changes.recciesV2Enabled.newValue);
    });
})();
