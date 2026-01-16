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
            /* Button hover effect */
            .order-id-copy-btn:hover {
                background-color: #e0e0e0 !important;
                border-color: #bbb !important;
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
            const originalBg = button.style.backgroundColor;
            const originalColor = button.style.color;

            button.textContent = 'Copied!';
            button.style.backgroundColor = '#333';
            button.style.color = '#fff';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.backgroundColor = originalBg;
                button.style.color = originalColor;
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

                     // Apply flexbox to the parent cell to push button to the far right
                     cell.style.display = 'flex';
                     cell.style.justifyContent = 'space-between';
                     cell.style.alignItems = 'center';

                     const copyBtn = document.createElement('button');
                     copyBtn.textContent = 'Copy';
                     copyBtn.className = 'order-id-copy-btn';
                     copyBtn.title = 'Copy Clean Order ID';

                     // Styling - space-between handles the gap now
                     copyBtn.style.padding = '2px 6px';
                     copyBtn.style.fontSize = '10px';
                     copyBtn.style.cursor = 'pointer';
                     copyBtn.style.backgroundColor = '#f0f0f0';
                     copyBtn.style.border = '1px solid #ccc';
                     copyBtn.style.borderRadius = '3px';
                     copyBtn.style.color = '#333';
                     copyBtn.style.lineHeight = 'normal';
                     copyBtn.style.whiteSpace = 'nowrap'; // Prevent button text wrapping
                     copyBtn.style.transition = 'background-color 0.2s, color 0.2s'; // Smooth transition

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
