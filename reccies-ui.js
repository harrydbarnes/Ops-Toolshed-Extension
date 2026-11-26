(function() {
    'use strict';
    const root = document.documentElement;
    const $ = id => document.getElementById(id);
    const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const enabled = () => root.dataset.recciesUi === 'v2';
    const tracks = new Map();
    let contentKey = '', contentTransition = null, listAnimation = null;
    let filtersHidden = false, filterFrame = 0, filterTimer = 0, filterToken = 0, summaryAnimation = null;
    const filters = document.querySelector('.filters');
    const filterBody = document.createElement('div'); filterBody.id = 'reccies-filter-body';
    filterBody.append(...filters.childNodes); filters.append(filterBody);
    const identity = document.createElement('div'); identity.className = 'reccies-filter-identity';
    for (const node of [...filterBody.childNodes]) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('view-controls')) break;
        identity.append(node);
    }
    filterBody.prepend(identity);
    const filterHeader = document.createElement('div'); filterHeader.className = 'reccies-filter-heading';
    const heading = document.createElement('strong'); heading.textContent = 'Find and filter recs';
    const filterToggle = document.createElement('button'); filterToggle.id = 'reccies-filter-toggle'; filterToggle.type = 'button';
    filterToggle.setAttribute('aria-controls', filterBody.id); filterHeader.append(heading, filterToggle); filters.prepend(filterHeader);
    const filterSummary = document.createElement('div'); filterSummary.className = 'reccies-filter-summary';
    const summaryText = document.createElement('span'); summaryText.id = 'reccies-filter-summary-text';
    const summaryClear = document.createElement('button'); summaryClear.type = 'button'; summaryClear.textContent = 'Clear filters';
    summaryClear.addEventListener('click', () => $('clear-filters').click());
    filterSummary.append(summaryText, summaryClear); filterHeader.after(filterSummary);
    const resultsMeta = document.createElement('div'); resultsMeta.className = 'reccies-results-meta';
    const summaryHome = document.createComment('Original summary position');
    $('summary').before(summaryHome);
    $('reccie-results-asof').before(resultsMeta);
    resultsMeta.append($('summary'), $('reccie-results-asof'));
    function setFiltersHidden(value, animate = false) {
        if (filterFrame) window.cancelAnimationFrame(filterFrame);
        if (filterTimer) window.clearTimeout(filterTimer);
        summaryAnimation?.cancel(); summaryAnimation = null;
        const token = ++filterToken;
        const start = filterBody.hidden ? 0 : filterBody.getBoundingClientRect().height;
        const opacity = filterBody.hidden ? '0' : window.getComputedStyle(filterBody).opacity;
        filtersHidden = enabled() && value;
        filterHeader.hidden = !enabled();
        filterToggle.textContent = filtersHidden ? 'Show filters' : 'Hide filters';
        filterToggle.setAttribute('aria-expanded', String(!filtersHidden));
        filterBody.inert = filtersHidden;
        filterSummary.hidden = true;
        const finish = () => {
            if (token !== filterToken) return;
            filterBody.hidden = filtersHidden;
            filterBody.style.height = '';
            filterBody.style.opacity = '';
            filterSummary.hidden = !filtersHidden;
            if (filtersHidden && animate && !reduced() && typeof filterSummary.animate === 'function') {
                const height = filterSummary.getBoundingClientRect().height;
                summaryAnimation = filterSummary.animate(
                    [{height:'0px',opacity:0,overflow:'hidden',paddingTop:'0px',paddingBottom:'0px'},
                        {height:`${height}px`,opacity:1,overflow:'hidden'}],
                    {duration:200,easing:'cubic-bezier(.22,1,.36,1)'}
                );
                summaryAnimation.onfinish = () => { summaryAnimation = null; };
            }
            filterFrame = filterTimer = 0;
        };
        if (!animate || reduced()) { finish(); updateFilters(); return; }
        filterBody.hidden = false;
        filterBody.style.height = `${start}px`;
        filterBody.style.opacity = opacity;
        void filterBody.offsetHeight;
        filterFrame = window.requestAnimationFrame(() => {
            if (token !== filterToken) return;
            filterBody.style.height = filtersHidden ? '0px' : `${filterBody.scrollHeight}px`;
            filterBody.style.opacity = filtersHidden ? '0' : '1';
            filterTimer = window.setTimeout(finish, 280);
        });
        updateFilters();
    }
    filterToggle.addEventListener('click', () => setFiltersHidden(!filtersHidden, true));
    function transitionContent(update, key) {
        const changed = contentKey && key !== contentKey;
        contentKey = key;
        contentTransition?.skipTransition?.(); contentTransition = null;
        listAnimation?.cancel(); listAnimation = null;
        if (enabled() && changed && !reduced() && typeof document.startViewTransition === 'function') {
            const transition = document.startViewTransition(update);
            contentTransition = transition;
            // Rapid selections may skip the snapshot; its ready rejection is expected.
            transition.ready?.catch(() => {});
            transition.finished.catch(() => {}).finally(() => { if(contentTransition===transition)contentTransition=null; });
        } else {
            update();
            if (enabled() && changed && !reduced() && typeof $('rows').animate === 'function') listAnimation = $('rows').animate([{opacity:0.35},{opacity:1}],{duration:160,easing:'ease-out'});
        }
        return true;
    }
    const url = $('sheet-url'), read = $('refresh-sheet');
    const readHome = document.createComment('Original read button position');
    read.before(readHome);
    const joined = document.createElement('div'); joined.className = 'reccies-sheet-input';
    const chips = document.querySelector('.status-chips');
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
        const sourceMetadata = $('source-status');
        sourceMetadata.classList.toggle('has-tracker', Boolean(sourceMetadata.textContent && !sourceMetadata.textContent.startsWith('No tracker')));
        const inputs = [...chips.querySelectorAll('[data-status]')];
        const person = $('person').selectedOptions[0]?.textContent || 'Choose your name';
        const role = $('assignment').selectedOptions[0]?.textContent || 'Assignment';
        const status = $('tracker-status').selectedOptions[0]?.textContent || 'Any';
        const selected = inputs.filter(input => input.checked).length;
        const query = $('search').value.trim();
        summaryText.textContent = [role, person, `Tracker: ${status}`, selected ? `${selected} Prisma filter${selected === 1 ? '' : 's'}` : 'Any Prisma status', query ? `Search: ${query}` : ''].filter(Boolean).join(' · ');
        summaryClear.hidden = $('clear-filters').hidden;
        summaryClear.disabled = $('clear-filters').disabled;
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
        if (enabled()) resultsMeta.append($('summary'), $('reccie-results-asof'));
        else { summaryHome.after($('summary')); resultsMeta.after($('reccie-results-asof')); }
        setFiltersHidden(filtersHidden);
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
            const metadata = document.createElement('div'); metadata.className = 'v2-campaign-metadata';
            const suppliers = new Map();
            rows.forEach(row => {
                const name = row.supplier?.trim() || 'Supplier not specified';
                const key = name.toLocaleLowerCase();
                if (!suppliers.has(key)) suppliers.set(key, {name, rows:[]});
                suppliers.get(key).rows.push(row);
            });
            metadata.textContent = `${rows[0].campaignId || 'No campaign ID'} · ${[...suppliers.values()].map(group => group.name).join(', ')}`;
            card.querySelector(':scope > .supplier')?.remove();
            card.querySelector(':scope > .campaign-d-numbers')?.remove();
            card.querySelector('.card-top').after(metadata);
            bottom.querySelector(':scope > span')?.remove();
            const placements = document.createElement('div'); placements.className = 'v2-placements';
            suppliers.forEach(group => {
                const section = document.createElement('section'); section.className = 'v2-supplier-group';
                const heading = document.createElement('div'); heading.className = 'v2-supplier-heading';
                const name = document.createElement('strong'); name.textContent = group.name;
                const count = document.createElement('span'); const total = new Set(group.rows.map(row => row.dNumber)).size;
                count.textContent = `${total} D number${total === 1 ? '' : 's'}`;
                heading.append(name, count); section.append(heading);
                group.rows.forEach(row => {
                    const item = document.createElement('div'); item.className = 'v2-placement';
                    const id = document.createElement('p'); id.className = 'v2-placement-id'; id.textContent = row.dNumber;
                    item.append(id, evidence(row, checks?.[row.sourceRow], observed)); if(row.comments){const note=document.createElement('p');note.className='comment';note.textContent=row.comments;item.append(note);} section.append(item);
                });
                placements.append(section);
            });
            bottom.before(placements);
        } else {
            const row = rows[0], result = checks?.[row.sourceRow];
            const metadata = document.createElement('p'); metadata.className = 'v2-entity-meta';
            metadata.textContent = [row.client, row.supplier].filter(Boolean).join(' · ');
            card.querySelectorAll(':scope > .supplier').forEach(node => node.classList.add('v2-original-entity'));
            card.querySelector('.campaign-name').after(metadata);
            card.querySelector('.status-lines').before(evidence(row, result, observed));
            const timing = bottom.querySelector(':scope > span');
            if (timing) { timing.classList.add('v2-card-timing'); bottom.before(timing); }
            const badge = card.querySelector('.card-top > .badge');
            if (badge && !row.issue && !result?.state) badge.remove();
            if (badge && !row.issue && result?.state === 'ready') badge.textContent = 'Reconciled in Prisma';
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
    window.reccieUi = {enabled, updateSegments, updateFilters, decorateCard, reveal, closeDialog, transitionContent};
    apply(true);
    Promise.resolve(chrome.storage.sync?.get({recciesV2Enabled:true})).then(settings => apply(settings?.recciesV2Enabled)).catch(() => {});
    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'sync' && changes.recciesV2Enabled) apply(changes.recciesV2Enabled.newValue);
    });
})();
