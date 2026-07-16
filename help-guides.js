(function() {
    const guides = Array.isArray(window.HELP_GUIDES) ? window.HELP_GUIDES : [];
    const categories = ['All', 'Access', 'Approval', 'Booking', 'Reconcile', 'Supplier Integrations', 'Traffic'];
    const categoryColors = {
        Access: '#2f6fb1',
        Approval: '#9a5eae',
        Booking: '#d28b25',
        Reconcile: '#3b7c95',
        'Supplier Integrations': '#5d8c68',
        Traffic: '#c15d76',
        'Proof of concept': '#596273'
    };
    const categoryAbbreviations = {
        Access: 'Acc',
        Approval: 'Appr',
        Booking: 'Book',
        Reconcile: 'Rec',
        'Supplier Integrations': 'Int',
        Traffic: 'Tfc',
        'Proof of concept': 'POC'
    };
    const categoryOrder = new Map(categories.slice(1).map((category, index) => [category, index]));
    const RECENT_LIMIT = 3;
    const VIEWER_HINT_LIMIT = 3;

    let activeCategory = 'All';
    let searchQuery = '';
    let sortMode = 'alpha';
    let favourites = new Set();
    let recentGuideIds = [];
    let currentGuide = null;
    let viewerFallbackTimer = null;
    let toastTimer = null;
    let toastCloseTimer = null;
    let viewTransitionTimer = null;
    let activePdfObjectUrl = null;
    let guideLoadRevision = 0;
    let viewerHintCount = 0;
    let viewerHintDismissed = false;
    let viewerHintTimer = null;
    let viewerHintCloseTimer = null;
    const favouriteAnimationTimers = new Set();
    let disableConfirmationActive = false;
    const viewTransitionDuration = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 280;

    const elements = {
        library: document.getElementById('library-view'),
        viewer: document.getElementById('viewer-view'),
        filters: document.getElementById('category-filters'),
        search: document.getElementById('guide-search'),
        clear: document.getElementById('clear-search'),
        sortOptions: document.querySelectorAll('[data-sort]'),
        summary: document.getElementById('results-summary'),
        list: document.getElementById('guide-list'),
        empty: document.getElementById('empty-state'),
        feedbackPrompt: document.querySelector('.help-feedback-prompt'),
        disableFeature: document.getElementById('disable-help-guides'),
        back: document.getElementById('back-to-guides'),
        viewerTitle: document.getElementById('viewer-title'),
        viewerCategory: document.getElementById('viewer-category'),
        frame: document.getElementById('pdf-frame'),
        customViewer: document.getElementById('custom-pdf-viewer'),
        pages: document.getElementById('pdf-pages'),
        canvasScroll: document.getElementById('pdf-canvas-scroll'),
        pdfPrevious: document.getElementById('pdf-previous-page'),
        pdfNext: document.getElementById('pdf-next-page'),
        pdfPageInput: document.getElementById('pdf-page-number'),
        pdfPageTotal: document.getElementById('pdf-page-total'),
        pdfZoomOut: document.getElementById('pdf-zoom-out'),
        pdfZoomIn: document.getElementById('pdf-zoom-in'),
        pdfZoomLabel: document.getElementById('pdf-zoom-label'),
        pdfFit: document.getElementById('pdf-fit-width'),
        pdfDownload: document.getElementById('pdf-download'),
        pdfSearchToggle: document.getElementById('pdf-search-toggle'),
        pdfSearchBar: document.getElementById('pdf-search-bar'),
        pdfSearchInput: document.getElementById('pdf-search-input'),
        pdfSearchCount: document.getElementById('pdf-search-count'),
        pdfSearchPrevious: document.getElementById('pdf-search-previous'),
        pdfSearchNext: document.getElementById('pdf-search-next'),
        pdfSearchClose: document.getElementById('pdf-search-close'),
        viewerHint: document.getElementById('viewer-coachmark'),
        dismissViewerHint: document.getElementById('dismiss-viewer-hint'),
        viewerHintTitle: document.getElementById('viewer-coachmark-title'),
        viewerHintMessage: document.getElementById('viewer-coachmark-message'),
        viewerHintOptout: document.getElementById('viewer-coachmark-optout'),
        viewerHintDisable: document.getElementById('viewer-coachmark-disable'),
        viewerHintProgress: document.querySelector('.viewer-coachmark-progress'),
        loading: document.getElementById('viewer-loading'),
        fallback: document.getElementById('viewer-fallback'),
        share: document.getElementById('share-guide'),
        favourite: document.getElementById('favourite-guide'),
        external: document.getElementById('open-external'),
        toastLayer: document.getElementById('panel-toast-layer'),
        toastMessage: document.getElementById('panel-toast-message')
    };

    const pdfViewer = globalThis.helpGuidePdfViewerFeature?.create({
        pages: elements.pages,
        scroller: elements.canvasScroll,
        previous: elements.pdfPrevious,
        next: elements.pdfNext,
        pageInput: elements.pdfPageInput,
        pageTotal: elements.pdfPageTotal,
        zoomOut: elements.pdfZoomOut,
        zoomIn: elements.pdfZoomIn,
        zoomLabel: elements.pdfZoomLabel,
        fit: elements.pdfFit,
        download: elements.pdfDownload,
        searchToggle: elements.pdfSearchToggle,
        searchBar: elements.pdfSearchBar,
        searchInput: elements.pdfSearchInput,
        searchCount: elements.pdfSearchCount,
        searchPrevious: elements.pdfSearchPrevious,
        searchNext: elements.pdfSearchNext,
        searchClose: elements.pdfSearchClose
    });

    function storageGet(area, defaults) {
        return new Promise(resolve => {
            if (!area?.get) {
                resolve({ ...defaults });
                return;
            }
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve({ ...defaults, ...(value || {}) });
            };
            try {
                const result = area.get(defaults, finish);
                if (result?.then) result.then(finish, () => finish(defaults));
            } catch {
                finish(defaults);
            }
        });
    }

    function storageSet(area, values) {
        return new Promise(resolve => {
            if (!area?.set) {
                resolve();
                return;
            }
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            try {
                const result = area.set(values, finish);
                if (result?.then) result.then(finish, finish);
            } catch {
                finish();
            }
        });
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function fuzzyTokenScore(haystack, token) {
        const directIndex = haystack.indexOf(token);
        if (directIndex >= 0) return directIndex;

        let score = 20;
        let lastIndex = -1;
        for (const character of token) {
            const nextIndex = haystack.indexOf(character, lastIndex + 1);
            if (nextIndex < 0) return null;
            score += nextIndex - lastIndex - 1;
            lastIndex = nextIndex;
        }
        return score;
    }

    function scoreGuide(guide, query) {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return 0;

        const haystack = normalize([guide.title, guide.category, ...guide.tags].join(' '));
        let total = 0;
        for (const token of normalizedQuery.split(/\s+/)) {
            const score = fuzzyTokenScore(haystack, token);
            if (score === null) return null;
            total += score;
        }
        return total;
    }

    function compareGuides(a, b) {
        if (sortMode === 'category') {
            const categoryDifference = (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99);
            if (categoryDifference !== 0) return categoryDifference;
        }
        return a.title.localeCompare(b.title);
    }

    function getFilteredGuides() {
        return guides
            .filter(guide => activeCategory === 'All' || guide.category === activeCategory)
            .map(guide => ({ guide, score: scoreGuide(guide, searchQuery) }))
            .filter(result => result.score !== null)
            .sort((a, b) => compareGuides(a.guide, b.guide))
            .map(result => result.guide);
    }

    function createFilter(category) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-filter';
        button.textContent = category;
        button.dataset.category = category;
        button.setAttribute('aria-pressed', String(category === activeCategory));
        button.addEventListener('click', () => setActiveCategory(category, button));
        return button;
    }

    function renderFilters() {
        elements.filters.replaceChildren(...categories.map(createFilter));
    }

    function updateFilterSelection(selectedButton) {
        elements.filters.querySelectorAll('.category-filter').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.category === activeCategory));
        });
        selectedButton?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function setActiveCategory(category, selectedButton) {
        activeCategory = category;
        updateFilterSelection(selectedButton);
        renderGuides();
    }

    function createGuideCard(guide) {
        const shell = document.createElement('div');
        shell.className = 'guide-card-shell';
        shell.dataset.guideShellId = guide.id;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'guide-card';
        button.dataset.guideId = guide.id;
        button.style.setProperty('--category-color', categoryColors[guide.category] || '#06088d');
        button.setAttribute('aria-label', `Open ${guide.title}, ${guide.category}`);

        const icon = document.createElement('span');
        icon.className = 'guide-file-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = categoryAbbreviations[guide.category] || 'Guide';

        const copy = document.createElement('span');
        copy.className = 'guide-card-copy';
        const title = document.createElement('strong');
        title.textContent = guide.title;
        const meta = document.createElement('span');
        meta.className = 'guide-meta';
        const dot = document.createElement('span');
        dot.className = 'category-dot';
        const category = document.createElement('span');
        category.textContent = guide.category;
        const tags = document.createElement('span');
        tags.className = 'guide-tags';
        guide.tags.slice(0, 2).forEach(tag => {
            const tagLabel = document.createElement('span');
            tagLabel.className = 'guide-tag';
            tagLabel.textContent = tag;
            tags.appendChild(tagLabel);
        });
        meta.append(dot, category, tags);
        copy.append(title, meta);

        const arrow = document.createElement('span');
        arrow.className = 'guide-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '›';

        button.append(icon, copy, arrow);
        button.addEventListener('click', () => openGuide(guide));
        shell.appendChild(button);

        const isFavourite = favourites.has(guide.id);
        shell.classList.toggle('has-favourite', isFavourite);
        const favouriteButton = document.createElement('button');
        favouriteButton.type = 'button';
        favouriteButton.className = 'guide-card-favourite';
        favouriteButton.classList.toggle('is-favourite', isFavourite);
        favouriteButton.setAttribute('aria-pressed', String(isFavourite));
        favouriteButton.setAttribute('aria-label', `${isFavourite ? 'Remove' : 'Add'} ${guide.title} ${isFavourite ? 'from' : 'to'} favourites`);
        favouriteButton.title = isFavourite ? 'Remove favourite' : 'Add favourite';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z');
        svg.appendChild(path);
        favouriteButton.appendChild(svg);
        favouriteButton.addEventListener('click', () => toggleFavouriteFromCard(guide, shell));
        shell.appendChild(favouriteButton);

        return shell;
    }

    function createGuideSection(label, sectionGuides, icon = '', variant = '') {
        const section = document.createElement('section');
        section.className = 'guide-section';
        if (variant) section.classList.add(`is-${variant}`);
        if (label) {
            const heading = document.createElement('h2');
            heading.className = 'guide-section-title';
            if (icon) {
                const marker = document.createElement('span');
                marker.className = 'section-icon';
                marker.setAttribute('aria-hidden', 'true');
                marker.textContent = icon;
                heading.appendChild(marker);
            }
            heading.appendChild(document.createTextNode(label));
            section.appendChild(heading);
        }
        section.append(...sectionGuides.map(createGuideCard));
        return section;
    }

    function getGuideSections(filteredGuides) {
        if (activeCategory !== 'All') return [{ label: '', guides: filteredGuides }];

        const debugGuides = filteredGuides.filter(guide => guide.isDebug === true);
        const standardGuides = filteredGuides.filter(guide => guide.isDebug !== true);
        const filteredIds = new Set(standardGuides.map(guide => guide.id));
        const favouriteGuides = standardGuides.filter(guide => favourites.has(guide.id));
        const favouriteIds = new Set(favouriteGuides.map(guide => guide.id));
        const recentGuides = recentGuideIds
            .filter(id => filteredIds.has(id) && !favouriteIds.has(id))
            .map(id => guides.find(guide => guide.id === id))
            .filter(Boolean)
            .slice(0, RECENT_LIMIT);
        const pinnedIds = new Set([...favouriteIds, ...recentGuides.map(guide => guide.id)]);
        const remainingGuides = standardGuides.filter(guide => !pinnedIds.has(guide.id));
        const sections = [];

        if (debugGuides.length) {
            sections.push({ label: 'Example PDFs · Debugging', icon: '◇', guides: debugGuides, variant: 'debug' });
        }
        if (favouriteGuides.length) sections.push({ label: 'Favourites', icon: '★', guides: favouriteGuides });
        if (recentGuides.length) sections.push({ label: 'Recently accessed', icon: '↻', guides: recentGuides });

        if (sortMode === 'category') {
            categories.slice(1).forEach(category => {
                const categoryGuides = remainingGuides.filter(guide => guide.category === category);
                if (categoryGuides.length) sections.push({ label: category, guides: categoryGuides });
            });
        } else if (remainingGuides.length) {
            sections.push({ label: favouriteGuides.length || recentGuides.length ? 'All guides' : '', guides: remainingGuides });
        }
        return sections;
    }

    function renderGuides() {
        const filteredGuides = getFilteredGuides();
        const sections = getGuideSections(filteredGuides);
        elements.list.replaceChildren(...sections.map(section =>
            createGuideSection(section.label, section.guides, section.icon, section.variant)
        ));
        elements.empty.hidden = filteredGuides.length > 0;
        elements.list.hidden = filteredGuides.length === 0;
        elements.feedbackPrompt.hidden = filteredGuides.length === 0;
        elements.clear.hidden = !searchQuery && activeCategory === 'All';
        elements.summary.textContent = `${filteredGuides.length} ${filteredGuides.length === 1 ? 'guide' : 'guides'}`;
    }

    function updateSortControls() {
        elements.sortOptions.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.sort === sortMode));
        });
    }

    function recordRecentGuide(guideId) {
        recentGuideIds = [guideId, ...recentGuideIds.filter(id => id !== guideId)].slice(0, RECENT_LIMIT);
        storageSet(globalThis.chrome?.storage?.local, { helpGuideRecentIds: recentGuideIds });
    }

    function updateFavouriteButton() {
        const isFavourite = Boolean(currentGuide && favourites.has(currentGuide.id));
        elements.favourite.classList.toggle('is-favourite', isFavourite);
        elements.favourite.setAttribute('aria-pressed', String(isFavourite));
        elements.favourite.setAttribute('aria-label', isFavourite ? 'Remove this guide from favourites' : 'Add this guide to favourites');
        elements.favourite.title = isFavourite ? 'Remove favourite' : 'Favourite guide';
    }

    function getEmbeddableGuideUrl(rawUrl) {
        try {
            const url = new URL(rawUrl);
            const isSharePointPdfShare = url.hostname.toLowerCase().endsWith('.sharepoint.com') &&
                url.pathname.includes('/:b:/');
            if (isSharePointPdfShare) url.searchParams.set('download', '1');
            return url.href;
        } catch {
            return rawUrl;
        }
    }

    function isSharePointPdfShare(rawUrl) {
        try {
            const url = new URL(rawUrl);
            return url.hostname.toLowerCase() === 'insidemedia.sharepoint.com' &&
                url.pathname.includes('/:b:/');
        } catch {
            return false;
        }
    }

    function releasePdfObjectUrl() {
        if (!activePdfObjectUrl) return;
        URL.revokeObjectURL(activePdfObjectUrl);
        activePdfObjectUrl = null;
    }

    function hideViewerHint({ animate = false } = {}) {
        window.clearTimeout(viewerHintTimer);
        window.clearTimeout(viewerHintCloseTimer);
        if (!animate || elements.viewerHint.hidden) {
            elements.viewerHint.hidden = true;
            elements.viewerHint.classList.remove('is-closing');
            return;
        }
        elements.viewerHint.classList.add('is-closing');
        viewerHintCloseTimer = window.setTimeout(() => {
            elements.viewerHint.hidden = true;
            elements.viewerHint.classList.remove('is-closing');
        }, 180);
    }

    function showViewerCoachmark({ title, message, showOptout = false, kind = 'tip' }) {
        window.clearTimeout(viewerHintTimer);
        window.clearTimeout(viewerHintCloseTimer);
        elements.viewerHint.classList.remove('is-closing');
        elements.viewerHint.dataset.kind = kind;
        elements.viewerHintTitle.textContent = title;
        elements.viewerHintMessage.textContent = message;
        elements.viewerHintOptout.hidden = !showOptout;
        elements.viewerHintDisable.checked = false;
        elements.viewerHint.hidden = false;
        elements.viewerHintProgress.style.animation = 'none';
        void elements.viewerHintProgress.offsetWidth;
        elements.viewerHintProgress.style.animation = '';
        viewerHintTimer = window.setTimeout(() => hideViewerHint({ animate: true }), 5000);
    }

    function maybeShowViewerHint() {
        if (!currentGuide || viewerHintDismissed || viewerHintCount >= VIEWER_HINT_LIMIT) return;
        viewerHintCount += 1;
        storageSet(globalThis.chrome?.storage?.local, { helpGuideViewerCoachmarkCount: viewerHintCount });
        showViewerCoachmark({
            title: 'Need more room?',
            message: 'Drag the panel edge to expand it, or choose Open for a full-size tab.',
            showOptout: true,
            kind: 'tip'
        });
    }

    function showOpenGuideCoachmark() {
        showViewerCoachmark({
            title: 'Opened in a new tab',
            message: 'You can close the Help Guides side panel if you wish.',
            kind: 'opened'
        });
    }

    function disableViewerHint() {
        if (!elements.viewerHintDisable.checked) return;
        viewerHintDismissed = true;
        storageSet(globalThis.chrome?.storage?.local, { helpGuideViewerHintDismissed: true });
        hideViewerHint({ animate: true });
    }

    function getPdfFilename(guide, responseUrl) {
        try {
            const filename = decodeURIComponent(new URL(responseUrl).pathname.split('/').pop() || '');
            if (/\.pdf$/i.test(filename)) return filename;
        } catch {
            // Fall back to the guide title for opaque SharePoint share links.
        }
        const safeTitle = guide.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Help guide';
        return `${safeTitle}.pdf`;
    }

    async function loadGuideIntoFrame(guide, revision) {
        const frameUrl = getEmbeddableGuideUrl(guide.url);
        if (!isSharePointPdfShare(guide.url)) {
            pdfViewer?.clear().catch(() => {});
            elements.customViewer.hidden = true;
            elements.frame.hidden = false;
            elements.frame.src = frameUrl;
            return;
        }

        if (!pdfViewer) throw new Error('The custom PDF viewer is unavailable.');
        elements.customViewer.hidden = false;
        elements.frame.hidden = true;
        elements.frame.src = 'about:blank';
        try {
            const response = await fetch(frameUrl, {
                cache: 'no-store',
                credentials: 'include',
                redirect: 'follow'
            });
            if (!response.ok) throw new Error(`SharePoint returned HTTP ${response.status}.`);

            const buffer = await response.arrayBuffer();
            const signature = String.fromCharCode(...new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength)));
            if (signature !== '%PDF-') throw new Error('SharePoint did not return a PDF file.');

            const objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
            if (revision !== guideLoadRevision || currentGuide?.id !== guide.id) {
                URL.revokeObjectURL(objectUrl);
                return;
            }

            activePdfObjectUrl = objectUrl;
            await pdfViewer.load(new Uint8Array(buffer), {
                downloadUrl: objectUrl,
                filename: getPdfFilename(guide, response.url || frameUrl)
            });
            if (revision !== guideLoadRevision || currentGuide?.id !== guide.id) return;
            window.clearTimeout(viewerFallbackTimer);
            elements.loading.hidden = true;
            elements.fallback.hidden = true;
            maybeShowViewerHint();
        } catch {
            if (revision !== guideLoadRevision || currentGuide?.id !== guide.id) return;
            window.clearTimeout(viewerFallbackTimer);
            pdfViewer?.clear().catch(() => {});
            elements.loading.hidden = true;
            elements.fallback.hidden = false;
        }
    }

    async function openGuide(guide) {
        window.clearTimeout(viewerFallbackTimer);
        window.clearTimeout(viewTransitionTimer);
        hideViewerHint();
        releasePdfObjectUrl();
        const loadRevision = ++guideLoadRevision;
        currentGuide = guide;
        recordRecentGuide(guide.id);
        elements.viewerTitle.textContent = guide.title;
        elements.viewerCategory.textContent = guide.category;
        elements.external.href = guide.url;
        elements.loading.hidden = false;
        elements.fallback.hidden = true;
        elements.viewer.hidden = false;
        elements.viewer.classList.add('is-entering');
        elements.library.classList.add('is-leaving');
        document.title = `${guide.title} – Help Guides`;
        updateFavouriteButton();
        if (viewTransitionDuration > 0) window.scrollTo?.(0, 0);
        finishViewTransition(() => {
            elements.library.hidden = true;
            elements.library.classList.remove('is-leaving');
            elements.viewer.classList.remove('is-entering');
            elements.back.focus();
        });
        viewerFallbackTimer = window.setTimeout(() => {
            if (!elements.loading.hidden) elements.fallback.hidden = false;
        }, 8000);
        await loadGuideIntoFrame(guide, loadRevision);
    }

    function closeGuide() {
        window.clearTimeout(viewerFallbackTimer);
        window.clearTimeout(viewTransitionTimer);
        guideLoadRevision += 1;
        hideViewerHint();
        pdfViewer?.clear().catch(() => {});
        releasePdfObjectUrl();
        elements.library.hidden = false;
        elements.library.classList.add('is-returning');
        elements.viewer.classList.add('is-leaving');
        document.title = 'Help Guides';
        renderGuides();
        finishViewTransition(() => {
            elements.frame.src = 'about:blank';
            elements.frame.hidden = false;
            elements.customViewer.hidden = true;
            elements.fallback.hidden = true;
            elements.viewer.hidden = true;
            elements.viewer.classList.remove('is-leaving');
            elements.library.classList.remove('is-returning');
            const previousCard = currentGuide
                ? elements.list.querySelector(`[data-guide-id="${currentGuide.id}"]`)
                : null;
            (previousCard || elements.search).focus();
        });
    }

    function finishViewTransition(callback) {
        if (viewTransitionDuration === 0) {
            callback();
            return;
        }
        viewTransitionTimer = window.setTimeout(callback, viewTransitionDuration);
    }

    function toggleFavourite() {
        if (!currentGuide) return;
        if (favourites.has(currentGuide.id)) favourites.delete(currentGuide.id);
        else favourites.add(currentGuide.id);
        storageSet(globalThis.chrome?.storage?.sync, { helpGuideFavouriteIds: [...favourites] });
        updateFavouriteButton();
    }

    function removeFavouriteFromCard(guide, shell) {
        if (!favourites.has(guide.id)) return;
        toggleFavouriteFromCard(guide, shell);
    }

    function toggleFavouriteFromCard(guide, shell) {
        const removing = favourites.has(guide.id);
        if (removing) favourites.delete(guide.id);
        else favourites.add(guide.id);
        storageSet(globalThis.chrome?.storage?.sync, { helpGuideFavouriteIds: [...favourites] });
        shell.classList.add(removing ? 'is-removing-favourite' : 'is-adding-favourite');
        const timer = window.setTimeout(() => {
            favouriteAnimationTimers.delete(timer);
            renderGuides();
        }, 260);
        favouriteAnimationTimers.add(timer);
    }

    function hidePanelToast(onComplete) {
        window.clearTimeout(toastTimer);
        window.clearTimeout(toastCloseTimer);
        window.clearTimeout(viewTransitionTimer);
        elements.toastLayer.classList.add('is-closing');
        toastCloseTimer = window.setTimeout(() => {
            elements.toastLayer.hidden = true;
            elements.toastLayer.classList.remove('is-closing');
            onComplete?.();
        }, 220);
    }

    function showPanelToast(message, options = {}) {
        const { duration = 1500, onComplete } = options;
        window.clearTimeout(toastTimer);
        window.clearTimeout(toastCloseTimer);
        elements.toastMessage.textContent = message;
        elements.toastLayer.classList.remove('is-closing');
        elements.toastLayer.hidden = false;
        toastTimer = window.setTimeout(() => hidePanelToast(onComplete), duration);
    }

    async function shareCurrentGuide() {
        if (!currentGuide) return;
        const shareData = { title: currentGuide.title, text: `${currentGuide.title} – MM&D Ops Toolshed`, url: currentGuide.url };
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share(shareData);
                return;
            }
            await navigator.clipboard.writeText(currentGuide.url);
            showPanelToast('Guide link copied');
        } catch (error) {
            if (error?.name !== 'AbortError') showPanelToast('Could not share this guide');
        }
    }

    async function closeSidePanel() {
        try {
            const response = await globalThis.chrome?.runtime?.sendMessage?.({ action: 'closeHelpGuides' });
            if (response?.status !== 'success') window.close();
        } catch {
            window.close();
        }
    }

    function handleDisableFeature() {
        if (!disableConfirmationActive) {
            disableConfirmationActive = true;
            elements.disableFeature.classList.add('is-confirming');
            elements.disableFeature.querySelector('span').textContent = 'Are You Sure?';
            return;
        }

        elements.disableFeature.disabled = true;
        storageSet(globalThis.chrome?.storage?.sync, { helpGuidesEnabled: false });
        showPanelToast('You can turn this on again in the Ops Toolshed settings', {
            duration: 2200,
            onComplete: closeSidePanel
        });
    }

    function dispose() {
        guideLoadRevision += 1;
        hideViewerHint();
        pdfViewer?.dispose().catch(() => {});
        releasePdfObjectUrl();
        window.clearTimeout(viewerFallbackTimer);
        window.clearTimeout(toastTimer);
        window.clearTimeout(toastCloseTimer);
        window.clearTimeout(viewerHintCloseTimer);
        favouriteAnimationTimers.forEach(timer => window.clearTimeout(timer));
        favouriteAnimationTimers.clear();
    }

    function notifyPanelState(action) {
        try {
            const result = globalThis.chrome?.runtime?.sendMessage?.({ action });
            result?.catch?.(() => {});
        } catch {
            // The panel may be closing after the extension context has gone away.
        }
    }

    async function hydratePreferences() {
        const [syncData, localData] = await Promise.all([
            storageGet(globalThis.chrome?.storage?.sync, { helpGuideFavouriteIds: [] }),
            storageGet(globalThis.chrome?.storage?.local, {
                helpGuideRecentIds: [],
                helpGuidesSortMode: 'alpha',
                helpGuideViewerCoachmarkCount: 0,
                helpGuideViewerHintDismissed: false
            })
        ]);
        favourites = new Set((syncData.helpGuideFavouriteIds || []).filter(id => guides.some(guide => guide.id === id)));
        recentGuideIds = (localData.helpGuideRecentIds || [])
            .filter(id => guides.some(guide => guide.id === id))
            .slice(0, RECENT_LIMIT);
        sortMode = localData.helpGuidesSortMode === 'category' ? 'category' : 'alpha';
        viewerHintCount = Math.min(
            VIEWER_HINT_LIMIT,
            Math.max(0, Number.parseInt(localData.helpGuideViewerCoachmarkCount, 10) || 0)
        );
        viewerHintDismissed = localData.helpGuideViewerHintDismissed === true;
        updateSortControls();
        renderGuides();
    }

    elements.search.addEventListener('input', event => {
        searchQuery = event.target.value;
        renderGuides();
    });

    elements.clear.addEventListener('click', () => {
        searchQuery = '';
        activeCategory = 'All';
        elements.search.value = '';
        const allFilter = elements.filters.querySelector('[data-category="All"]');
        updateFilterSelection(allFilter);
        renderGuides();
        elements.search.focus();
    });

    elements.sortOptions.forEach(button => button.addEventListener('click', () => {
        sortMode = button.dataset.sort === 'category' ? 'category' : 'alpha';
        storageSet(globalThis.chrome?.storage?.local, { helpGuidesSortMode: sortMode });
        updateSortControls();
        renderGuides();
    }));

    document.querySelectorAll('.help-feedback-trigger').forEach(button => {
        button.addEventListener('click', () => window.feedbackModalFeature?.open({
            variant: 'help-guides',
            categories: [...categories.slice(1), 'Other'],
            types: ['New training material', 'Training material amend', 'Feedback'],
            sectionLabel: 'Category',
            sectionPlaceholder: 'Select a category',
            detailPlaceholder: 'Share your suggestion or feedback with detail here, with any relevant accessible links',
            showIdeaBy: false
        }));
    });

    elements.disableFeature.addEventListener('click', handleDisableFeature);
    elements.share.addEventListener('click', shareCurrentGuide);
    elements.favourite.addEventListener('click', toggleFavourite);
    elements.back.addEventListener('click', closeGuide);
    elements.dismissViewerHint.addEventListener('click', () => hideViewerHint({ animate: true }));
    elements.viewerHintDisable.addEventListener('change', disableViewerHint);
    elements.external.addEventListener('click', showOpenGuideCoachmark);
    elements.frame.addEventListener('load', () => {
        if (elements.frame.hidden || elements.frame.src === 'about:blank') return;
        window.clearTimeout(viewerFallbackTimer);
        elements.loading.hidden = true;
        maybeShowViewerHint();
    });
    elements.frame.addEventListener('error', () => {
        if (elements.frame.hidden) return;
        window.clearTimeout(viewerFallbackTimer);
        elements.loading.hidden = true;
        elements.fallback.hidden = false;
    });

    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            if (elements.library.hidden) closeGuide();
            elements.search.focus();
        } else if (event.key === 'Escape' && !elements.viewer.hidden) {
            closeGuide();
        }
    });
    if (!globalThis.chrome?.sidePanel?.onClosed) {
        window.addEventListener('pagehide', () => notifyPanelState('helpGuidesPanelClosed'), { once: true });
    }

    renderFilters();
    updateSortControls();
    renderGuides();
    elements.search.focus();
    notifyPanelState('helpGuidesPanelOpened');
    const hydration = hydratePreferences();

    window.helpGuidesApp = {
        normalize,
        fuzzyTokenScore,
        scoreGuide,
        getEmbeddableGuideUrl,
        getFilteredGuides,
        setActiveCategory,
        openGuide,
        closeGuide,
        toggleFavourite,
        removeFavouriteFromCard,
        shareCurrentGuide,
        handleDisableFeature,
        showPanelToast,
        dispose,
        hydratePreferences: () => hydration,
        getState: () => ({
            activeCategory,
            searchQuery,
            sortMode,
            favourites: [...favourites],
            recentGuideIds: [...recentGuideIds],
            viewerHintCount,
            viewerHintDismissed,
            currentGuideId: currentGuide?.id || null
        })
    };
})();
