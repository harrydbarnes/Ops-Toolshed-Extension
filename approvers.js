import { approversData, businessUnits, clients } from './approvers-data.js';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const favoritesOnlyButton = document.getElementById('favorites-only-button');
    const businessUnitsContainer = document.getElementById('business-units-filters');
    const clientsContainer = document.getElementById('clients-filters');
    const approversList = document.getElementById('approvers-list');
    const approversCount = document.getElementById('approvers-count');
    const selectedCount = document.getElementById('selected-count');
    const copyButton = document.getElementById('copy-button');
    const copySaveButton = document.getElementById('copy-save-button');
    const toastNotification = document.getElementById('toast-notification');

    let selectedApprovers = new Set();
    let favoriteApprovers = new Set();

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

    const updateSelectedCount = () => {
        const footerActions = document.querySelector('.footer-actions');
        selectedCount.textContent = `${selectedApprovers.size} approver${selectedApprovers.size === 1 ? '' : 's'} selected`;
        if (selectedApprovers.size > 0) {
            footerActions.classList.remove('hidden');
        } else {
            footerActions.classList.add('hidden');
        }
    };

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

    const showToast = (message) => { // message: The message to display in the toast notification
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

    clients.forEach(client => {
        const button = document.createElement('button');
        button.className = 'filter-button';
        button.dataset.value = client;
        button.textContent = client;
        clientsContainer.appendChild(button);
    });

    loadFavorites();
});
