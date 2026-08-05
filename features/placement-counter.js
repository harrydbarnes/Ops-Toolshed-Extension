// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;
    let debounceTimeout = null;
    let selectionListenerInstalled = false;
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    const EXCLUSION_TEXTS = [
        "display", // User requested exclusion
        "media total" // User requested exclusion
    ];

    function getHierarchyLevel(row, nameCell) {
        const rowLevelElements = Array.from(
            row.querySelectorAll('[class*="hierarchical-level-"]')
        );
        const levelElements = nameCell
            ? [nameCell, ...rowLevelElements.filter(element => element !== nameCell)]
            : rowLevelElements;

        for (const levelElement of levelElements) {
            const levelClass = Array.from(levelElement.classList)
                .find(className => /^hierarchical-level-\d+$/.test(className));
            if (levelClass) {
                return Number(levelClass.replace('hierarchical-level-', ''));
            }
        }
        return null;
    }

    function getGroupLevel(row) {
        const groupLevelElement = Array.from(
            row.querySelectorAll('[class*="hierarchical-level-group-"]')
        ).find(element => Array.from(element.classList)
            .some(className => /^hierarchical-level-group-\d+$/.test(className)));

        if (!groupLevelElement) return null;

        const groupLevelClass = Array.from(groupLevelElement.classList)
            .find(className => /^hierarchical-level-group-\d+$/.test(className));
        return groupLevelClass
            ? Number(groupLevelClass.replace('hierarchical-level-group-', ''))
            : null;
    }

    function isGroupRow(row, nameCell) {
        return Boolean(
            nameCell && (
                nameCell.matches('.group-cell') ||
                Array.from(nameCell.classList)
                    .some(className => className.startsWith('hierarchical-level-group-'))
            )
        );
    }

    function isFeeName(nameText) {
        return /\bfees?\b/.test(nameText);
    }

    function getFeeRowIds(rows) {
        const feeRowIds = new Set();
        let activeFeeGroupLevel = null;

        rows.forEach(row => {
            const checkbox = row.querySelector('input.mo-row-checkbox[type="checkbox"]');
            const rowId = checkbox?.dataset.row;
            const nameCell = row.querySelector('[id^="placementName-"]');
            const nameText = (nameCell?.textContent || '').toLowerCase();
            const isGroup = isGroupRow(row, nameCell);
            const hierarchyLevel = getHierarchyLevel(row, nameCell);
            const groupLevel = getGroupLevel(row);
            const effectiveGroupLevel = groupLevel ?? (isGroup ? hierarchyLevel : null);

            if (activeFeeGroupLevel !== null) {
                const isSiblingGroup = isGroup && effectiveGroupLevel !== null &&
                    effectiveGroupLevel <= activeFeeGroupLevel;
                const isSiblingLeaf = !isGroup && hierarchyLevel !== null &&
                    hierarchyLevel <= activeFeeGroupLevel;
                if (isSiblingGroup || isSiblingLeaf) {
                    activeFeeGroupLevel = null;
                }
            }

            if (isFeeName(nameText)) {
                if (rowId) feeRowIds.add(rowId);
                if (isGroup) {
                    activeFeeGroupLevel = effectiveGroupLevel ?? 0;
                }
            } else if (activeFeeGroupLevel !== null && rowId) {
                feeRowIds.add(rowId);
            }
        });

        return feeRowIds;
    }

    function formatSelectionMessage(packageCounts, placementCount, feeCount) {
        const packageCount = packageCounts.length;
        const packageText = packageCount
            ? `${packageCount} Package${packageCount === 1 ? '' : 's'} Selected ` +
                `(w/${packageCounts.reduce((total, count) => total + count, 0)} ` +
                `Placement${packageCounts.reduce((total, count) => total + count, 0) === 1 ? '' : 's'})`
            : '';
        const placementText = placementCount
            ? `${placementCount} Placement${placementCount === 1 ? '' : 's'} Selected`
            : '';
        const feeText = feeCount
            ? `${feeCount} Fee${feeCount === 1 ? '' : 's'} Selected`
            : '';

        return [packageText, placementText, feeText].filter(Boolean).join(', ');
    }

    // --- Toast Logic (Functions showToast and hideToast remain unchanged) ---
    function showToast(message) {
        clearTimeout(toastTimeout);
        if (!currentToast) {
            currentToast = document.createElement('div');
            currentToast.className = 'placement-toast';
            document.body.appendChild(currentToast);
            setTimeout(() => {
                if(currentToast) currentToast.classList.add('show');
            }, 10);
        }
        currentToast.textContent = message;
        toastTimeout = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            setTimeout(() => {
                if (currentToast && currentToast.parentElement) {
                    document.body.removeChild(currentToast);
                }
                currentToast = null;
            }, 500);
        }
    }

    // --- Core Logic with Debounce ---
    function checkSelectionAndDisplay() {
        clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {
            if (!chrome.runtime || !chrome.runtime.id) {
                return;
            }

            chrome.storage.sync.get(SETTING_KEY, (data) => {
                if (chrome.runtime.lastError) {
                    console.warn("Placement counter: Extension context invalidated during async operation. Skipping check.");
                    return;
                }

                if (!data[SETTING_KEY]) {
                    hideToast();
                    return;
                }

                const gridContainer = document.querySelector('#grid-container_hot');
                if (!gridContainer) {
                    hideToast();
                    return;
                }

                // Handsontable renders cloned overlay tables alongside its canonical
                // master table. Read only the master so a stale clone cannot create a
                // phantom selection.
                const selectionRoot = gridContainer.querySelector('.ht_master') || gridContainer;
                const allRows = Array.from(selectionRoot.querySelectorAll('tr'));
                const feeRowIds = getFeeRowIds(allRows);
                const selectedCheckboxes = selectionRoot.querySelectorAll(
                    'input.mo-row-checkbox[type="checkbox"]:checked'
                );
                const selectedRows = [];
                const selectedRowIds = new Set();

                selectedCheckboxes.forEach(checkbox => {
                    const row = checkbox.closest('tr');
                    if (!row) return;

                    const rowId = checkbox.dataset.row;
                    if (!rowId || selectedRowIds.has(rowId)) return;
                    selectedRowIds.add(rowId);

                    const nameCell = row.querySelector(`#placementName-${rowId}`);
                    const nameText = (nameCell ? nameCell.textContent : '').toLowerCase();

                    const hierarchyLevel = getHierarchyLevel(row, nameCell);
                    const isLevel0 = hierarchyLevel === 0;
                    const isGroup = isGroupRow(row, nameCell);
                    const isPackage = Boolean(
                        row.matches('.mi-package, .mi-programmatic-package') ||
                        row.querySelector('.mi-package, .mi-programmatic-package')
                    );
                    const isTextExcluded = EXCLUSION_TEXTS.some(exclusion => nameText.includes(exclusion));
                    const isFee = feeRowIds.has(rowId) || isFeeName(nameText);

                    selectedRows.push({
                        rowId,
                        hierarchyLevel,
                        isLevel0,
                        isGroup,
                        isPackage,
                        isTextExcluded,
                        isFee
                    });
                });

                // A package is either explicitly marked with the box icon or is a selected
                // hierarchy row with selected, nested rows below it. The latter also covers
                // Programmatic packages, which use a different icon in Prisma.
                const packageIndexes = new Set();
                selectedRows.forEach((selectedRow, index) => {
                    if (selectedRow.isPackage) {
                        packageIndexes.add(index);
                        return;
                    }

                    if (
                        selectedRow.isGroup ||
                        selectedRow.hierarchyLevel === null ||
                        selectedRow.isLevel0
                    ) return;

                    for (let nextIndex = index + 1; nextIndex < selectedRows.length; nextIndex += 1) {
                        const nextLevel = selectedRows[nextIndex].hierarchyLevel;
                        if (nextLevel === null || nextLevel <= selectedRow.hierarchyLevel) break;
                        if (nextLevel > selectedRow.hierarchyLevel) {
                            packageIndexes.add(index);
                            break;
                        }
                    }
                });

                const packageCounts = [];
                const packageChildRowIds = new Set();
                packageIndexes.forEach(packageIndex => {
                    const packageRow = selectedRows[packageIndex];
                    let placementCount = 0;

                    for (let index = packageIndex + 1; index < selectedRows.length; index += 1) {
                        const childRow = selectedRows[index];
                        if (childRow.hierarchyLevel !== null && childRow.hierarchyLevel <= packageRow.hierarchyLevel) break;
                        if (
                            !childRow.isLevel0 &&
                            !childRow.isGroup &&
                            !childRow.isPackage &&
                            !childRow.isTextExcluded &&
                            !childRow.isFee
                        ) {
                            placementCount += 1;
                            packageChildRowIds.add(childRow.rowId);
                        }
                    }

                    packageCounts.push(placementCount);
                });

                const feeCount = selectedRows.filter((selectedRow, index) => (
                    !packageIndexes.has(index) &&
                    !selectedRow.isLevel0 &&
                    !selectedRow.isGroup &&
                    selectedRow.isFee
                )).length;
                const placementCount = selectedRows.filter((selectedRow, index) => (
                    !packageIndexes.has(index) &&
                    !packageChildRowIds.has(selectedRow.rowId) &&
                    !selectedRow.isLevel0 &&
                    !selectedRow.isGroup &&
                    !selectedRow.isTextExcluded &&
                    !selectedRow.isFee
                )).length;
                const message = formatSelectionMessage(packageCounts, placementCount, feeCount);
                if (message) {
                    showToast(message);
                } else {
                    hideToast();
                }
            });
        }, 150);
    }

    function initializePlacementCounter() {
        const styleId = 'placement-counter-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .placement-toast {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    background-color: #ff3d80; /* Default Pink */
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    z-index: 2147483647;
                    font-family: 'Outfit', sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    visibility: hidden;
                    opacity: 0;
                    transform: translateY(100%); /* Start off-screen */
                    transition: visibility 0s 0.5s, opacity 0.5s ease, transform 0.5s ease;
                }
                /* Theme Override */
                body.ui-theme-black .placement-toast {
                    background-color: #333;
                }
                .placement-toast.show {
                    visibility: visible;
                    opacity: 1;
                    transform: translateY(0);
                    transition-delay: 0s;
                }
            `;
            document.head.appendChild(style);
        }

        // Fetch and apply theme
        chrome.storage.sync.get('uiTheme', (data) => {
             if (data.uiTheme === 'black') {
                document.body.classList.add('ui-theme-black');
            } else {
                document.body.classList.remove('ui-theme-black');
            }
        });

        // Listen for updates (handled by order-id-copy usually, but good to be redundant for safety)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.uiTheme) {
                if (changes.uiTheme.newValue === 'black') {
                    document.body.classList.add('ui-theme-black');
                } else {
                    document.body.classList.remove('ui-theme-black');
                }
            }
        });

        if (!selectionListenerInstalled) {
            document.addEventListener('change', (event) => {
                if (
                    event.target &&
                    event.target.matches('input.mo-row-checkbox[type="checkbox"]')
                ) {
                    checkSelectionAndDisplay();
                }
            }, true);
            selectionListenerInstalled = true;
        }

        checkSelectionAndDisplay();
    }

    window.placementCounterFeature = {
        initialize: initializePlacementCounter,
        checkSelection: checkSelectionAndDisplay
    };
})();
