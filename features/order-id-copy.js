(function() {
    'use strict';

    function cleanOrderId(orderId) {
        // Remove suffix starting with -R
        // e.g. O-5YWFK-R0 -> O-5YWFK
        return orderId.split('-R')[0];
    }

    function handleCopy(button, orderIdText) {
        const cleanedId = cleanOrderId(orderIdText);
        navigator.clipboard.writeText(cleanedId).then(() => {
            if (window.utils && window.utils.showToast) {
                window.utils.showToast(`Copied Order ID: ${cleanedId}`, 'success');
            } else {
                console.log(`Copied Order ID: ${cleanedId}`);
                // Fallback visual feedback if toast utils missing
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => button.textContent = originalText, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            if (window.utils && window.utils.showToast) {
                window.utils.showToast('Failed to copy Order ID', 'error');
            }
        });
    }

    function checkAndAddCopyButtons() {
        // Only run on specific URLs
        if (!window.location.href.includes('=prsm-cm-ord&campaign-id=')) {
            return;
        }

        // Selector: <td class="pad"> containing <a> with potential Order ID
        // The user mentioned the structure: <td class="pad"> ... <a ...>O-5YWFK-R0</a> ... </td>
        const cells = document.querySelectorAll('td.pad');
        cells.forEach(cell => {
            const link = cell.querySelector('a');
             if (link) {
                 const text = link.textContent.trim();

                 // Check if it looks like an Order ID (O-xxxxx-Rx) using a robust regex
                 // And check if we haven't already added the button to this cell
                 if (/^O-[\w]+-R\d+$/.test(text) && !cell.querySelector('.order-id-copy-btn')) {

                     const copyBtn = document.createElement('button');
                     copyBtn.textContent = 'Copy';
                     copyBtn.className = 'order-id-copy-btn';
                     copyBtn.title = 'Copy Clean Order ID';

                     copyBtn.addEventListener('click', (e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         handleCopy(copyBtn, text);
                     });

                     link.insertAdjacentElement('afterend', copyBtn);
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
