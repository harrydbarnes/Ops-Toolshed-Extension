import { approversData, businessUnits, clients, functions, companyUserIdsList } from './approvers-data.js';

export const renderApprovers = (approvers, context) => {
    const {
        approversList,
        approversCount,
        selectedApprovers,
        favoriteApprovers,
        document = window.document
    } = context;

    approversList.replaceChildren();
    approversCount.textContent = `${approvers.length} approver${approvers.length !== 1 ? 's' : ''} found`;

    if (approvers.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'No approvers found matching your criteria.';
        approversList.appendChild(p);
        return;
    }

    approvers.forEach(approver => {
        const card = document.createElement('div');
        card.className = `approver-card ${selectedApprovers.has(approver.id) ? 'selected' : ''}`;
        card.dataset.approverId = approver.id;

        const isFavorited = favoriteApprovers.has(approver.id);

        // Header
        const header = document.createElement('div');
        header.className = 'approver-card-header';

        const h4 = document.createElement('h4');
        h4.textContent = `${approver.firstName} ${approver.lastName}`;

        const star = document.createElement('i');
        star.className = `favorite-star ${isFavorited ? 'fas fa-star favorited' : 'far fa-star'}`;

        header.appendChild(h4);
        header.appendChild(star);

        // Email
        const pEmail = document.createElement('p');
        pEmail.textContent = approver.email;

        // Tags
        const tags = document.createElement('div');
        tags.className = 'approver-tags';

        const tagOffice = document.createElement('span');
        tagOffice.className = 'tag';
        tagOffice.textContent = approver.officeName;

        const tagUnit = document.createElement('span');
        tagUnit.className = 'tag';
        tagUnit.textContent = approver.businessUnit;

        tags.appendChild(tagOffice);
        tags.appendChild(tagUnit);

        if (approver.specialty && approver.specialty !== approver.businessUnit) {
            const tagSpecialty = document.createElement('span');
            tagSpecialty.className = 'tag specialty';
            tagSpecialty.textContent = approver.specialty;
            tags.appendChild(tagSpecialty);
        }

        card.appendChild(header);
        card.appendChild(pEmail);
        card.appendChild(tags);

        approversList.appendChild(card);
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const favoritesOnlyButton = document.getElementById('favorites-only-button');
    const businessUnitsContainer = document.getElementById('business-units-filters');
    const functionContainer = document.getElementById('function-filters');
    const clientsContainer = document.getElementById('clients-filters');
    const companyUserIdsContainer = document.getElementById('company-user-ids-filters');
    const approversList = document.getElementById('approvers-list');
    const approversCount = document.getElementById('approvers-count');
    const selectedCount = document.getElementById('selected-count');
    const copyButton = document.getElementById('copy-button');
    const copySaveButton = document.getElementById('copy-save-button');
    const toastNotification = document.getElementById('toast-notification');
    const toggleCompanyUserIdsButton = document.getElementById('toggle-company-user-ids');

    let selectedApprovers = new Set();
    let favoriteApprovers = new Set();

    // Internal wrapper to bridge the exported function
    const renderApproversWrapper = (approvers) => {
        renderApprovers(approvers, {
            approversList,
            approversCount,
            selectedApprovers,
            favoriteApprovers
        });
    };

    const updateSelectedCount = () => {
        const footerActions = document.querySelector('.footer-actions');
        selectedCount.textContent = `${selectedApprovers.size} approver${selectedApprovers.size === 1 ? '' : 's'} selected`;

        const isVisible = footerActions.classList.contains('visible');

        if (selectedApprovers.size > 0 && !isVisible) {
            footerActions.classList.remove('hidden');
            footerActions.classList.add('visible');
        } else if (selectedApprovers.size === 0 && isVisible) {
            footerActions.classList.remove('visible');
            footerActions.classList.add('hiding');
            setTimeout(() => {
                footerActions.classList.add('hidden');
                footerActions.classList.remove('hiding');
            }, 250); // Corresponds to the animation duration
        }
    };

    const filterApprovers = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const favoritesOnly = favoritesOnlyButton.classList.contains('active');
        const activeBusinessUnits = [...businessUnitsContainer.querySelectorAll('.active')].map(btn => btn.dataset.value);
        const activeFunctions = [...functionContainer.querySelectorAll('.active')].map(btn => btn.dataset.value);
        const activeClients = [...clientsContainer.querySelectorAll('.active')].map(btn => btn.dataset.value);
        const activeCompanyUserIds = [...companyUserIdsContainer.querySelectorAll('.active')].map(btn => btn.dataset.value);

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
            filtered = filtered.filter(a => activeBusinessUnits.includes(a.businessUnit));
        }

        if (activeClients.length > 0) {
            filtered = filtered.filter(a => activeClients.includes(a.officeName));
        }

        if (activeCompanyUserIds.length > 0) {
            filtered = filtered.filter(a =>
                activeCompanyUserIds.every(id => a.companyUserIds && a.companyUserIds.includes(id))
            );
        }

        if (activeFunctions.length > 0) {
            filtered = filtered.filter(a =>
                activeFunctions.includes(a.businessUnit) || activeFunctions.includes(a.specialty)
            );
        }

        renderApproversWrapper(filtered);
    };

    const toggleFilterButton = (e) => {
        if (e.target.classList.contains('filter-button')) {
            e.target.classList.toggle('active');
            filterApprovers();
        }
    };

    const loadFavorites = async () => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const { favoriteApprovers: favs } = await chrome.storage.local.get(['favoriteApprovers']);
            if (favs) {
                favoriteApprovers = new Set(favs);
            }
        }
        filterApprovers();
    };

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
    functionContainer.addEventListener('click', toggleFilterButton);
    clientsContainer.addEventListener('click', toggleFilterButton);
    companyUserIdsContainer.addEventListener('click', toggleFilterButton);

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
     * Shows a toast notification with a given message.
     * @param {string} message The message to display in the toast notification.
     */
    const showToast = (message) => {
        const toastMessage = toastNotification.querySelector('.toast-message');
        if (toastMessage) {
            toastMessage.textContent = message;
        }
        toastNotification.classList.add('show');
        setTimeout(() => {
            toastNotification.classList.remove('show');
            toastNotification.classList.add('hide');
            setTimeout(() => {
                toastNotification.classList.remove('hide');
            }, 500);
        }, 3000);
    };

    copyButton.addEventListener('click', () => {
        const emails = [...selectedApprovers].map(id => approversData.find(a => a.id === id).email);
        navigator.clipboard.writeText(emails.join('; ')).then(() => {
            showToast('Copied to clipboard!');
        });
    });

    copySaveButton.addEventListener('click', () => {
        const emails = [...selectedApprovers].map(id => approversData.find(a => a.id === id).email);
        navigator.clipboard.writeText(emails.join('; ')).then(() => {
            showToast('Favourites updated and copied to clipboard!');
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

    functions.forEach(func => {
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.value = func;
        button.textContent = func;
        functionContainer.appendChild(button);
    });

    clients.forEach(client => {
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.value = client;
        button.textContent = client;
        clientsContainer.appendChild(button);
    });

    const visibleIds = ['NGMCALL', 'NGMCLON', 'NGOPEM', 'NGOPEN', 'NGMCKRM'];
    const initialFiltersContainer = document.querySelector('.initial-filters-container');
    const moreFiltersContainer = document.querySelector('.more-filters-container');

    companyUserIdsList.forEach(id => {
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.value = id;
        button.textContent = id;

        if (visibleIds.includes(id)) {
            initialFiltersContainer.appendChild(button);
        } else {
            moreFiltersContainer.appendChild(button);
        }
    });

    toggleCompanyUserIdsButton.addEventListener('click', () => {
        const isExpanded = toggleCompanyUserIdsButton.getAttribute('aria-expanded') === 'true';
        const toggleText = toggleCompanyUserIdsButton.querySelector('.toggle-text');
        const toggleIcon = toggleCompanyUserIdsButton.querySelector('i');

        toggleCompanyUserIdsButton.setAttribute('aria-expanded', !isExpanded);
        moreFiltersContainer.classList.toggle('is-expanded');

        if (isExpanded) {
            toggleText.textContent = 'More';
            toggleIcon.classList.remove('fa-chevron-up');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            toggleText.textContent = 'Hide';
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-up');
        }
    });

    // Feedback
    const menuFeedback = document.getElementById('menu-feedback-btn');
    if (menuFeedback) {
        menuFeedback.addEventListener('click', () => {
            if (window.feedbackModalFeature) {
                window.feedbackModalFeature.open();
            }
        });
    }

    // Excel List
    const menuExcelList = document.getElementById('menu-excel-list');
    if (menuExcelList) {
        menuExcelList.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://insidemedia.sharepoint.com/:x:/s/TPO-SharePoint/EYxRbLkQU_xLpMSvnQQFIt4Bug1w9CJupONy6sIdr6IuFw?email=harry.barnes%40wppmedia.com&e=Mi9JPh' });
        });
    }

    // Display Build Info
    if (window.buildInfo) {
        const buildInfoDiv = document.getElementById('build-info');
        if (buildInfoDiv) {
            buildInfoDiv.textContent = `Build Date: ${window.buildInfo.buildDate} | Commit: ${window.buildInfo.commitId}`;
        }
    }

    loadFavorites();
});