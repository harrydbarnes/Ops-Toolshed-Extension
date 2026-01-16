(function() {
    'use strict';

    // Inject styles for the toast and button animations
    const STYLE_ID = 'order-id-copy-styles';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .order-id-copy-toast {
                position: fixed;
                top: 60px; /* Slightly lower than 20px to avoid overlapping top bar */
                right: 20px;
                background-color: #333;
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
                transform: translateY(-100%); /* Start from top */
                transition: visibility 0s 0.5s, opacity 0.5s ease, transform 0.5s ease;
                pointer-events: none;
            }
            .order-id-copy-toast.show {
                visibility: visible;
                opacity: 1;
                transform: translateY(0);
                transition-delay: 0s;
            }
            .order-id-copy-cell {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .order-id-copy-btn {
                --btn-bg: #f0f0f0;
                --btn-border-color: #ccc;
                --btn-text-color: #333;
                --btn-hover-bg: #e0e0e0;
                --btn-hover-border-color: #bbb;
                --btn-copied-bg: #333;
                --btn-copied-text-color: #fff;

                padding: 2px 6px;
                font-size: 10px;
                cursor: pointer;
                background-color: var(--btn-bg);
                border: 1px solid var(--btn-border-color);
                border-radius: 3px;
                color: var(--btn-text-color);
                line-height: normal;
                white-space: nowrap; /* Prevent button text wrapping */
                transition: background-color 0.2s, color 0.2s, border-color 0.2s; /* Smooth transition */
            }
            /* Button hover effect */
            .order-id-copy-btn:hover {
                background-color: var(--btn-hover-bg);
                border-color: var(--btn-hover-border-color);
            }
            .order-id-copy-btn.copied {
                background-color: var(--btn-copied-bg);
                color: var(--btn-copied-text-color);
            }
        `;
        document.head.appendChild(style);
    }

    let toastTimeout;
    let currentToast = null;

    function showToast(message) {
        clearTimeout(toastTimeout);
        if (!currentToast) {
            currentToast = document.createElement('div');
            currentToast.className = 'order-id-copy-toast';
            document.body.appendChild(currentToast);
            // Trigger reflow/wait for append
            setTimeout(() => {
                if(currentToast) currentToast.classList.add('show');
            }, 10);
        } else {
             currentToast.classList.add('show');
        }
        currentToast.textContent = message;
        toastTimeout = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            setTimeout(() => {
                if (currentToast && currentToast.parentElement && !currentToast.classList.contains('show')) {
                    document.body.removeChild(currentToast);
                    currentToast = null;
                }
            }, 500);
        }
    }

    function cleanOrderId(orderId) {
        // Remove suffix starting with -R
        // e.g. O-5YWFK-R0 -> O-5YWFK
        return orderId.split('-R')[0];
    }

    function handleCopy(button, orderIdText) {
        const cleanedId = cleanOrderId(orderIdText);
        navigator.clipboard.writeText(cleanedId).then(() => {
            showToast(`Copied Order ID: ${cleanedId}`);

            // Visual feedback on button
            const originalText = button.textContent;

            button.textContent = 'Copied!';
            button.classList.add('copied');

            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);

        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('Failed to copy Order ID');
        });
    }

    function checkAndAddCopyButtons() {
        // Only run on specific URLs
        if (!window.location.href.includes('=prsm-cm-ord&campaign-id=')) {
            return;
        }

        // Selector: <td class="pad"> containing <a> with potential Order ID
        const cells = document.querySelectorAll('td.pad');
        cells.forEach(cell => {
             const link = cell.querySelector('a');
             if (link) {
                 const text = link.textContent.trim();

                 // Check if it looks like an Order ID (O-xxxxx-Rx)
                 // And check if we haven't already added the button to this cell
                 if (/^O-[\w]+-R\d+$/.test(text) && !cell.querySelector('.order-id-copy-btn')) {

                     // Apply flexbox via class to the parent cell to push button to the far right
                     cell.classList.add('order-id-copy-cell');

                     const copyBtn = document.createElement('button');
                     copyBtn.textContent = 'Copy';
                     copyBtn.className = 'order-id-copy-btn';
                     copyBtn.title = 'Copy Clean Order ID';

                     copyBtn.addEventListener('click', (e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         handleCopy(copyBtn, text);
                     });

                     // Append directly to the cell, so it sits as a flex sibling to the link
                     cell.appendChild(copyBtn);
                 }
             }
        });
    }

    function initialize() {
        chrome.storage.sync.get('orderIdCopyEnabled', (data) => {
            if (data.orderIdCopyEnabled !== false) {
                 checkAndAddCopyButtons();
            }
        });
    }

    window.orderIdCopyFeature = {
        initialize,
        checkAndAddCopyButtons
    };
})();
