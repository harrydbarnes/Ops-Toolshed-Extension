import { approversData, businessUnits, clients } from './approvers-data.js';

/**
 * Initializes the approvers page logic when the DOM content is fully loaded.
 * Sets up event listeners, filters, and renders the initial list of approvers.
 */
document.addEventListener('DOMContentLoaded', () => {
    /** @type {HTMLInputElement} The search input field for filtering approvers. */
    const searchInput = document.getElementById('search-input');
    /** @type {HTMLElement} The button to filter by favorites only. */
    const favoritesOnlyButton = document.getElementById('favorites-only-button');
    /** @type {HTMLElement} The container for business unit filter buttons. */
    const businessUnitsContainer = document.getElementById('business-units-filters');
    /** @type {HTMLElement} The container for client filter buttons. */
    const clientsContainer = document.getElementById('clients-filters');
    /** @type {HTMLElement} The container where approver cards are rendered. */
    const approversList = document.getElementById('approvers-list');
    /** @type {HTMLElement} The element displaying the count of found approvers. */
    const approversCount = document.getElementById('approvers-count');
    /** @type {HTMLElement} The element displaying the count of selected approvers. */
    const selectedCount = document.getElementById('selected-count');
    /** @type {HTMLElement} The button to copy selected approvers' emails. */
    const copyButton = document.getElementById('copy-button');
    /** @type {HTMLElement} The button to copy emails and save selected approvers as favorites. */
    const copySaveButton = document.getElementById('copy-save-button');
    /** @type {HTMLElement} The toast notification element. */
    const toastNotification = document.getElementById('toast-notification');

    /**
     * A Set containing the IDs of currently selected approvers.
     * @type {Set<string>}
     */
    let selectedApprovers = new Set();

    /**
     * A Set containing the IDs of favorite approvers.
     * @type {Set<string>}
     */
    let favoriteApprovers = new Set();

    /**
     * Renders the list of approver cards to the DOM.
     * @param {Array<Approver>} approvers - The list of approver objects to display.
     */
    const renderApprovers = (approvers) => {
        approversList.innerHTML = '';
        approversCount.textContent = `${approvers.length} approver${approvers.length !== 1 ? 's' : ''} found`;

        if (approvers.length === 0) {
            approversList.innerHTML = '<p>No approvers found matching your criteria.</p>';
            return;
        }

        approvers.forEach(approver => {
            const card = document.createElement('div');
            card.className = `approver-card ${selectedApprovers.has(approver.id) ? 'selected' : ''}`;
            card.dataset.approverId = approver.id;

            const isFavorited = favoriteApprovers.has(approver.id);
            card.innerHTML = `
                <div class="approver-card-header">
                    <h4>${approver.firstName} ${approver.lastName}</h4>
                    <i class="favorite-star ${isFavorited ? 'fas fa-star favorited' : 'far fa-star'}"></i>
                </div>
                <p>${approver.email}</p>
                <div class="approver-tags">
                    <span class="tag">${approver.officeName}</span>
                    ${approver.specialty ? `<span class="tag specialty">${approver.specialty}</span>` : ''}
                </div>
            `;
            approversList.appendChild(card);
        });
    };

    /**
     * Updates the UI to reflect the number of selected approvers.
     * Toggles the visibility of the footer actions.
     */
    const updateSelectedCount = () => {
        const footerActions = document.querySelector('.footer-actions');
        selectedCount.textContent = `${selectedApprovers.size} approver${selectedApprovers.size === 1 ? '' : 's'} selected`;
        if (selectedApprovers.size > 0) {
            footerActions.classList.remove('hidden');
        } else {
            footerActions.classList.add('hidden');
        }
    };

    /**
     * Filters the approvers list based on search term, favorites status, business units, and clients.
     * Renders the filtered list.
     */
    const filterApprovers = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const favoritesOnly = favoritesOnlyButton.classList.contains('active');
        const activeBusinessUnits = [...businessUnitsContainer.querySelectorAll('.active')].map(btn => btn.dataset.value);
        const activeClients = [...clientsContainer.querySelectorAll('.active')].map(btn => btn.dataset.value);

        let filtered = approversData;

        if (searchTerm) {
            filtered = filtered.filter(a =>
                a.firstName.toLowerCase().includes(searchTerm) ||
                a.lastName.toLowerCase().includes(searchTerm) ||
                a.email.toLowerCase().includes(searchTerm)
            );
        }

        if (favoritesOnly) {
            filtered = filtered.filter(a => favoriteApprovers.has(a.id));
        }

        if (activeBusinessUnits.length > 0) {
            if(activeBusinessUnits.includes("All")) {
                // do nothing
            } else {
                filtered = filtered.filter(a => activeBusinessUnits.includes(a.businessUnit));
            }
        }

        if (activeClients.length > 0) {
            filtered = filtered.filter(a => activeClients.includes(a.officeName));
        }

        renderApprovers(filtered);
    };

    /**
     * Toggles the active state of a filter button and triggers a re-filter.
     * @param {Event} e - The click event.
     */
    const toggleFilterButton = (e) => {
        if (e.target.classList.contains('filter-button')) {
            e.target.classList.toggle('active');
            filterApprovers();
        }
    };

    /**
     * Loads favorite approvers from Chrome storage.
     * @async
     */
    const loadFavorites = async () => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const { favoriteApprovers: favs } = await chrome.storage.local.get(['favoriteApprovers']);
            if (favs) {
                favoriteApprovers = new Set(favs);
            }
        }
        filterApprovers();
    };

    /**
     * Saves the current set of favorite approvers to Chrome storage.
     */
    const saveFavorites = () => {
        chrome.storage.local.set({ favoriteApprovers: [...favoriteApprovers] });
    };

    // Event Listeners
    searchInput.addEventListener('input', filterApprovers);

    favoritesOnlyButton.addEventListener('click', () => {
        favoritesOnlyButton.classList.toggle('active');
        const icon = favoritesOnlyButton.querySelector('i');
        icon.classList.toggle('fas');
        icon.classList.toggle('far');
        filterApprovers();
    });

    businessUnitsContainer.addEventListener('click', toggleFilterButton);
    clientsContainer.addEventListener('click', toggleFilterButton);

    approversList.addEventListener('click', (e) => {
        const card = e.target.closest('.approver-card');
        if (!card) return;

        const approverId = card.dataset.approverId;
        const starIcon = e.target;

        if (starIcon.classList.contains('favorite-star')) {
            // Toggle favorite state in the Set
            if (favoriteApprovers.has(approverId)) {
                favoriteApprovers.delete(approverId);
                starIcon.classList.remove('favorited', 'fas');
                starIcon.classList.add('far');
            } else {
                favoriteApprovers.add(approverId);
                starIcon.classList.add('favorited', 'fas');
                starIcon.classList.remove('far');
            }
            saveFavorites();

            // Trigger pop animation
            starIcon.classList.add('popping');
            starIcon.addEventListener('animationend', () => {
                starIcon.classList.remove('popping');
            }, { once: true });

            // If "Favorites Only" is active, we must re-filter to remove the item
            if (favoritesOnlyButton.classList.contains('active')) {
                // Add a small delay to allow the pop animation to be seen
                setTimeout(filterApprovers, 300);
            }
        } else {
            // Handle card selection
            if (selectedApprovers.has(approverId)) {
                selectedApprovers.delete(approverId);
            } else {
                selectedApprovers.add(approverId);
            }
            card.classList.toggle('selected');
            updateSelectedCount();
        }
    });

    /**
     * Shows a temporary toast notification to the user.
     */
    const showToast = () => {
        toastNotification.classList.add('show');
        setTimeout(() => {
            toastNotification.classList.remove('show');
            toastNotification.classList.add('hide');
            // Clean up classes after animation
            setTimeout(() => {
                toastNotification.classList.remove('hide');
            }, 500); // 0.5s animation
        }, 3000);
    };

    copyButton.addEventListener('click', () => {
        const emails = [...selectedApprovers].map(id => approversData.find(a => a.id === id).email);
        navigator.clipboard.writeText(emails.join('; ')).then(() => {
            showToast();
        });
    });

    copySaveButton.addEventListener('click', () => {
        const emails = [...selectedApprovers].map(id => approversData.find(a => a.id === id).email);
        navigator.clipboard.writeText(emails.join('; ')).then(() => {
            showToast();
        });
        selectedApprovers.forEach(id => favoriteApprovers.add(id));
        saveFavorites();
        filterApprovers();
    });

    // Initial Population
    businessUnits.forEach(unit => {
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.value = unit;
        button.textContent = unit;
        businessUnitsContainer.appendChild(button);
    });

    clients.forEach(client => {
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.value = client;
        button.textContent = client;
        clientsContainer.appendChild(button);
    });

    loadFavorites();
});
