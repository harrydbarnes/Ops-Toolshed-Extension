(function() {
    'use strict';

    function replaceLogo() {
        // Use the utility function from utils.js
        const uniquePath = window.utils.queryShadowDom('path[d="M9.23616 0C4.13364 0 0 3.78471 0 8.455C0 13.1253 4.13364 16.91 9.23616 16.91"]');
        const specificSvg = uniquePath ? uniquePath.closest('svg') : null;
        const logoContainer = specificSvg ? specificSvg.parentElement : null;

        if (logoContainer) {
            if (logoContainer.querySelector('.custom-prisma-logo')) {
                return;
            }

            if (!logoContainer.dataset.originalSvgContent && specificSvg) {
                logoContainer.dataset.originalSvgContent = specificSvg.outerHTML;
            }

            if (specificSvg) {
                specificSvg.remove();
            }

            const newLogoImg = document.createElement('img');
            newLogoImg.src = chrome.runtime.getURL('icon.png');
            newLogoImg.style.width = '32px';
            newLogoImg.style.height = '28px';
            newLogoImg.style.objectFit = 'contain';
            newLogoImg.className = 'custom-prisma-logo';

            logoContainer.appendChild(newLogoImg);
        }
    }

    function restoreOriginalLogo() {
        const customLogoImg = document.querySelector('i.logo > img.custom-prisma-logo');
        if (customLogoImg) {
            const logoContainer = customLogoImg.parentElement;
            if (logoContainer && logoContainer.dataset.originalSvgContent) {
                customLogoImg.remove();
                if (!logoContainer.querySelector('svg[width="20"][height="28"]')) {
                     logoContainer.innerHTML = logoContainer.dataset.originalSvgContent + logoContainer.innerHTML;
                }
            } else if (logoContainer) {
                customLogoImg.remove();
            }
        }
    }

    function checkAndReplaceLogo() {
        if (!chrome.runtime || !chrome.runtime.id) {
            return;
        }

        chrome.storage.sync.get('logoReplaceEnabled', function(data) {
            if (chrome.runtime.lastError) {
                console.error(`Error getting logoReplaceEnabled setting: ${chrome.runtime.lastError.message}`);
                return;
            }
            if (data.logoReplaceEnabled !== false) {
                replaceLogo();
            } else {
                restoreOriginalLogo();
            }
        });
    }

    function shouldReplaceLogoOnThisPage() {
        if (typeof window === 'undefined' || !window.location || !window.location.href) {
            return false;
        }
        const url = window.location.href;
        const allowedDomains = ['aura.mediaocean.com', 'prisma.mediaocean.com', 'go.demo.mediaocean.com'];
        return allowedDomains.some(domain => url.includes(domain));
    }

    // Expose the functions to the global scope
    window.logoFeature = {
        checkAndReplaceLogo,
        shouldReplaceLogoOnThisPage
    };
})();