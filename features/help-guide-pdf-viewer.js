(function() {
    const PDF_MODULE_PATH = 'vendor/pdfjs/pdf.min.mjs';
    const PDF_WORKER_PATH = 'vendor/pdfjs/pdf.worker.min.mjs';
    const MIN_SCALE = 0.4;
    const MAX_SCALE = 3;
    const SCALE_STEP = 0.25;
    let libraryPromise = null;

    function extensionUrl(path) {
        return globalThis.chrome?.runtime?.getURL?.(path) || path;
    }

    async function loadLibrary() {
        if (globalThis.pdfjsLib) return globalThis.pdfjsLib;
        if (!libraryPromise) {
            libraryPromise = import(extensionUrl(PDF_MODULE_PATH)).then(library => {
                library.GlobalWorkerOptions.workerSrc = extensionUrl(PDF_WORKER_PATH);
                return library;
            });
        }
        return libraryPromise;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(value, minimum), maximum);
    }

    function normalizeSearchText(value) {
        return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function create(elements) {
        let pdfDocument = null;
        let loadingTask = null;
        let pageNumber = 1;
        let zoomMode = 'fit';
        let manualScale = 1;
        let renderedScale = 1;
        let renderRevision = 0;
        let documentRevision = 0;
        let searchRevision = 0;
        let resizeTimer = null;
        let searchTimer = null;
        let scrollFrame = null;
        const renderTasks = new Set();
        const pageElements = new Map();
        const textCache = new Map();
        let searchResults = [];
        let searchIndex = -1;

        function updateControls() {
            const pageCount = pdfDocument?.numPages || 0;
            elements.pageInput.value = pageCount ? String(pageNumber) : '1';
            elements.pageInput.max = String(Math.max(1, pageCount));
            elements.pageTotal.textContent = String(pageCount || '–');
            elements.previous.disabled = !pageCount || pageNumber <= 1;
            elements.next.disabled = !pageCount || pageNumber >= pageCount;
            elements.zoomOut.disabled = !pageCount || (zoomMode === 'manual' && manualScale <= MIN_SCALE);
            elements.zoomIn.disabled = !pageCount || (zoomMode === 'manual' && manualScale >= MAX_SCALE);
            elements.fit.disabled = !pageCount;
            elements.fit.setAttribute('aria-pressed', String(zoomMode === 'fit'));
            elements.zoomLabel.textContent = pageCount ? `${Math.round(renderedScale * 100)}%` : '–';
        }

        function updateSearchControls() {
            const hasResults = searchResults.length > 0;
            elements.searchPrevious.disabled = !hasResults;
            elements.searchNext.disabled = !hasResults;
            elements.searchCount.textContent = hasResults ? `${searchIndex + 1} of ${searchResults.length}` : '0 of 0';
        }

        function cancelRenders() {
            renderTasks.forEach(task => task.cancel?.());
            renderTasks.clear();
        }

        function setCurrentPage(value) {
            const nextPage = clamp(Number.parseInt(value, 10) || 1, 1, pdfDocument?.numPages || 1);
            if (pageNumber === nextPage) return;
            pageNumber = nextPage;
            updateControls();
        }

        function scrollToPage(value, behavior = 'smooth') {
            if (!pdfDocument) return;
            const nextPage = clamp(Number.parseInt(value, 10) || 1, 1, pdfDocument.numPages);
            const page = pageElements.get(nextPage);
            if (!page) return;
            setCurrentPage(nextPage);
            elements.scroller.scrollTo?.({ top: Math.max(0, page.offsetTop - 12), left: 0, behavior });
        }

        function trackVisiblePage() {
            scrollFrame = null;
            if (!pdfDocument || !pageElements.size) return;
            const target = elements.scroller.scrollTop + (elements.scroller.clientHeight * 0.35);
            let closestPage = 1;
            let closestDistance = Number.POSITIVE_INFINITY;
            pageElements.forEach((page, number) => {
                const top = page.offsetTop;
                const bottom = top + page.offsetHeight;
                const distance = target < top ? top - target : target > bottom ? target - bottom : 0;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPage = number;
                }
            });
            setCurrentPage(closestPage);
        }

        async function renderAllPages({ preservePage = true } = {}) {
            if (!pdfDocument) return;
            const revision = ++renderRevision;
            const retainedPage = preservePage ? pageNumber : 1;
            cancelRenders();
            pageElements.clear();
            elements.pages.replaceChildren();

            const firstPage = await pdfDocument.getPage(1);
            if (revision !== renderRevision) return;
            const firstViewport = firstPage.getViewport({ scale: 1 });
            const availableWidth = Math.max(220, elements.scroller.clientWidth - 32);
            renderedScale = zoomMode === 'fit'
                ? clamp(availableWidth / firstViewport.width, MIN_SCALE, MAX_SCALE)
                : manualScale;
            updateControls();

            for (let number = 1; number <= pdfDocument.numPages; number += 1) {
                const page = number === 1 ? firstPage : await pdfDocument.getPage(number);
                if (revision !== renderRevision) return;
                const viewport = page.getViewport({ scale: renderedScale });
                const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2);
                const wrapper = document.createElement('section');
                const canvas = document.createElement('canvas');
                const badge = document.createElement('span');
                wrapper.className = 'pdf-page';
                wrapper.dataset.pageNumber = String(number);
                wrapper.setAttribute('aria-label', `Page ${number} of ${pdfDocument.numPages}`);
                canvas.setAttribute('role', 'img');
                canvas.setAttribute('aria-label', `Page ${number} of ${pdfDocument.numPages}`);
                badge.className = 'pdf-page-badge';
                badge.textContent = String(number);
                canvas.width = Math.floor(viewport.width * outputScale);
                canvas.height = Math.floor(viewport.height * outputScale);
                canvas.style.width = `${Math.floor(viewport.width)}px`;
                canvas.style.height = `${Math.floor(viewport.height)}px`;
                wrapper.append(canvas, badge);
                elements.pages.append(wrapper);
                pageElements.set(number, wrapper);

                const context = canvas.getContext('2d', { alpha: false });
                if (!context) throw new Error('Canvas rendering is unavailable.');
                const task = page.render({
                    canvasContext: context,
                    viewport,
                    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
                });
                renderTasks.add(task);
                try {
                    await task.promise;
                } catch (error) {
                    if (error?.name !== 'RenderingCancelledException') throw error;
                } finally {
                    renderTasks.delete(task);
                }
            }

            if (revision !== renderRevision) return;
            pageNumber = clamp(retainedPage, 1, pdfDocument.numPages);
            updateControls();
            scrollToPage(pageNumber, 'auto');
        }

        async function getPageText(number) {
            if (textCache.has(number)) return textCache.get(number);
            const page = await pdfDocument.getPage(number);
            const content = await page.getTextContent();
            const text = normalizeSearchText(content.items.map(item => item.str || '').join(' '));
            textCache.set(number, text);
            return text;
        }

        function showSearchResult(index) {
            pageElements.forEach(page => page.classList.remove('is-search-result'));
            if (!searchResults.length) {
                searchIndex = -1;
                updateSearchControls();
                return;
            }
            searchIndex = (index + searchResults.length) % searchResults.length;
            const resultPage = searchResults[searchIndex];
            pageElements.get(resultPage)?.classList.add('is-search-result');
            scrollToPage(resultPage);
            updateSearchControls();
        }

        async function performSearch(rawQuery) {
            const revision = ++searchRevision;
            const query = normalizeSearchText(rawQuery).trim();
            searchResults = [];
            searchIndex = -1;
            if (!pdfDocument || !query) {
                pageElements.forEach(page => page.classList.remove('is-search-result'));
                updateSearchControls();
                return;
            }
            elements.searchCount.textContent = 'Searching…';
            for (let number = 1; number <= pdfDocument.numPages; number += 1) {
                const text = await getPageText(number);
                if (revision !== searchRevision) return;
                if (text.includes(query)) searchResults.push(number);
            }
            showSearchResult(0);
        }

        function scheduleSearch() {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => performSearch(elements.searchInput.value), 180);
        }

        function toggleSearch(forceOpen) {
            const open = typeof forceOpen === 'boolean' ? forceOpen : elements.searchBar.hidden;
            elements.searchBar.hidden = !open;
            elements.searchToggle.setAttribute('aria-pressed', String(open));
            if (open) elements.searchInput.focus();
            else {
                elements.searchInput.value = '';
                performSearch('');
                elements.searchToggle.focus();
            }
        }

        async function clear() {
            documentRevision += 1;
            renderRevision += 1;
            searchRevision += 1;
            window.clearTimeout(resizeTimer);
            window.clearTimeout(searchTimer);
            if (scrollFrame !== null) (globalThis.cancelAnimationFrame || window.clearTimeout)(scrollFrame);
            scrollFrame = null;
            cancelRenders();
            loadingTask?.destroy?.();
            loadingTask = null;
            if (pdfDocument) await pdfDocument.destroy?.();
            pdfDocument = null;
            pageNumber = 1;
            zoomMode = 'fit';
            manualScale = 1;
            renderedScale = 1;
            pageElements.clear();
            textCache.clear();
            searchResults = [];
            searchIndex = -1;
            elements.pages.replaceChildren();
            elements.searchInput.value = '';
            elements.searchBar.hidden = true;
            elements.searchToggle.setAttribute('aria-pressed', 'false');
            elements.download.removeAttribute('href');
            elements.download.removeAttribute('download');
            updateControls();
            updateSearchControls();
        }

        async function load(data, { downloadUrl, filename }) {
            await clear();
            const revision = documentRevision;
            const library = await loadLibrary();
            if (revision !== documentRevision) return { cancelled: true, pageCount: 0 };
            library.GlobalWorkerOptions.workerSrc = extensionUrl(PDF_WORKER_PATH);
            const task = library.getDocument({ data });
            loadingTask = task;
            const loadedDocument = await task.promise;
            if (revision !== documentRevision) {
                await loadedDocument.destroy?.();
                return { cancelled: true, pageCount: 0 };
            }
            pdfDocument = loadedDocument;
            if (loadingTask === task) loadingTask = null;
            elements.download.href = downloadUrl;
            elements.download.download = filename;
            elements.download.setAttribute('aria-label', `Download ${filename}`);
            await renderAllPages({ preservePage: false });
            return { cancelled: false, pageCount: pdfDocument.numPages };
        }

        elements.previous.addEventListener('click', () => scrollToPage(pageNumber - 1));
        elements.next.addEventListener('click', () => scrollToPage(pageNumber + 1));
        elements.pageInput.addEventListener('change', () => scrollToPage(elements.pageInput.value));
        elements.pageInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            scrollToPage(elements.pageInput.value);
        });
        elements.zoomOut.addEventListener('click', () => {
            manualScale = clamp((zoomMode === 'fit' ? renderedScale : manualScale) - SCALE_STEP, MIN_SCALE, MAX_SCALE);
            zoomMode = 'manual';
            renderAllPages();
        });
        elements.zoomIn.addEventListener('click', () => {
            manualScale = clamp((zoomMode === 'fit' ? renderedScale : manualScale) + SCALE_STEP, MIN_SCALE, MAX_SCALE);
            zoomMode = 'manual';
            renderAllPages();
        });
        elements.fit.addEventListener('click', () => {
            zoomMode = 'fit';
            renderAllPages();
        });
        elements.searchToggle.addEventListener('click', () => toggleSearch());
        elements.searchClose.addEventListener('click', () => toggleSearch(false));
        elements.searchInput.addEventListener('input', scheduleSearch);
        elements.searchBar.addEventListener('submit', event => {
            event.preventDefault();
            showSearchResult(event.shiftKey ? searchIndex - 1 : searchIndex + 1);
        });
        elements.searchPrevious.addEventListener('click', () => showSearchResult(searchIndex - 1));
        elements.searchNext.addEventListener('click', () => showSearchResult(searchIndex + 1));
        elements.scroller.addEventListener('scroll', () => {
            if (scrollFrame !== null) return;
            const schedule = globalThis.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
            scrollFrame = schedule(trackVisiblePage);
        }, { passive: true });

        const resizeObserver = globalThis.ResizeObserver
            ? new ResizeObserver(() => {
                if (!pdfDocument || zoomMode !== 'fit') return;
                window.clearTimeout(resizeTimer);
                resizeTimer = window.setTimeout(() => renderAllPages(), 120);
            })
            : null;
        resizeObserver?.observe(elements.scroller);
        updateControls();
        updateSearchControls();

        return {
            load,
            clear,
            renderAllPages,
            performSearch,
            dispose: async () => {
                resizeObserver?.disconnect();
                await clear();
            },
            getState: () => ({
                pageNumber,
                pageCount: pdfDocument?.numPages || 0,
                zoomMode,
                scale: renderedScale,
                searchResultCount: searchResults.length,
                searchIndex
            })
        };
    }

    globalThis.helpGuidePdfViewerFeature = { create, loadLibrary, normalizeSearchText };
})();
