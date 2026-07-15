(function() {
    const guides = Array.isArray(window.HELP_GUIDES) ? window.HELP_GUIDES : [];
    const categories = ['All', 'Booking', 'Reconciliation', 'DST', 'Meta', 'Supplier'];
    const categoryColors = {
        Booking: '#d28b25',
        Reconciliation: '#3b7c95',
        DST: '#a05b7d',
        Meta: '#4772c6',
        Supplier: '#5d8c68'
    };

    let activeCategory = 'All';
    let searchQuery = '';
    let viewerFallbackTimer = null;

    const elements = {
        library: document.getElementById('library-view'),
        viewer: document.getElementById('viewer-view'),
        filters: document.getElementById('category-filters'),
        search: document.getElementById('guide-search'),
        clear: document.getElementById('clear-search'),
        summary: document.getElementById('results-summary'),
        list: document.getElementById('guide-list'),
        empty: document.getElementById('empty-state'),
        back: document.getElementById('back-to-guides'),
        viewerTitle: document.getElementById('viewer-title'),
        viewerCategory: document.getElementById('viewer-category'),
        frame: document.getElementById('pdf-frame'),
        loading: document.getElementById('viewer-loading'),
        fallback: document.getElementById('viewer-fallback'),
        external: document.getElementById('open-external')
    };

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

    function getFilteredGuides() {
        return guides
            .filter(guide => activeCategory === 'All' || guide.category === activeCategory)
            .map(guide => ({ guide, score: scoreGuide(guide, searchQuery) }))
            .filter(result => result.score !== null)
            .sort((a, b) => a.score - b.score || a.guide.title.localeCompare(b.guide.title))
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
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'guide-card';
        button.dataset.guideId = guide.id;
        button.style.setProperty('--category-color', categoryColors[guide.category] || '#d28b25');
        button.setAttribute('aria-label', `Open ${guide.title}, ${guide.category}`);

        const icon = document.createElement('span');
        icon.className = 'guide-file-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'PDF';

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
        tags.textContent = guide.tags.slice(0, 2).join(' · ');
        meta.append(dot, category, tags);
        copy.append(title, meta);

        const arrow = document.createElement('span');
        arrow.className = 'guide-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '›';

        button.append(icon, copy, arrow);
        button.addEventListener('click', () => openGuide(guide));
        return button;
    }

    function renderGuides() {
        const filteredGuides = getFilteredGuides();
        elements.list.replaceChildren(...filteredGuides.map(createGuideCard));
        elements.empty.hidden = filteredGuides.length > 0;
        elements.list.hidden = filteredGuides.length === 0;
        elements.clear.hidden = !searchQuery && activeCategory === 'All';
        elements.summary.textContent = `${filteredGuides.length} ${filteredGuides.length === 1 ? 'guide' : 'guides'}`;
    }

    function openGuide(guide) {
        window.clearTimeout(viewerFallbackTimer);
        elements.viewerTitle.textContent = guide.title;
        elements.viewerCategory.textContent = guide.category;
        elements.external.href = guide.url;
        elements.loading.hidden = false;
        elements.fallback.hidden = true;
        elements.frame.src = guide.url;
        elements.library.hidden = true;
        elements.viewer.hidden = false;
        document.title = `${guide.title} – Help Guides`;
        elements.back.focus();
        viewerFallbackTimer = window.setTimeout(() => {
            if (!elements.loading.hidden) elements.fallback.hidden = false;
        }, 8000);
    }

    function closeGuide() {
        window.clearTimeout(viewerFallbackTimer);
        elements.frame.src = 'about:blank';
        elements.fallback.hidden = true;
        elements.viewer.hidden = true;
        elements.library.hidden = false;
        document.title = 'Help Guides';
        const previousCard = elements.list.querySelector('.guide-card');
        (previousCard || elements.search).focus();
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

    elements.back.addEventListener('click', closeGuide);
    elements.frame.addEventListener('load', () => {
        window.clearTimeout(viewerFallbackTimer);
        elements.loading.hidden = true;
    });
    elements.frame.addEventListener('error', () => {
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

    renderFilters();
    renderGuides();
    elements.search.focus();

    window.helpGuidesApp = {
        normalize,
        fuzzyTokenScore,
        scoreGuide,
        getFilteredGuides,
        setActiveCategory,
        openGuide,
        closeGuide
    };
})();
