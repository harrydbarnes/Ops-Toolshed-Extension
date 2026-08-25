(function() {
    'use strict';

    // Local cache for settings
    let isLogoReplaceEnabled = true;
    const MAX_SHADOW_ROOTS_TO_CHECK = 24;
    const MAX_ELEMENTS_TO_WALK = 300;

    // Prisma's campaign workspace can keep a very large, changing grid in the
    // light DOM.  The old helper recursively called querySelectorAll('*') for
    // every open shadow root, which made a small cosmetic logo check compete
    // with that render work.  Walk a small, early portion of the component
    // shell instead: the logo is part of the header and is encountered there.
    function findInHeaderShadowRoots(selector) {
        const directMatch = document.querySelector(selector);
        if (directMatch) return directMatch;

        const roots = [document];
        let rootsChecked = 0;
        let elementsWalked = 0;

        while (roots.length && rootsChecked < MAX_SHADOW_ROOTS_TO_CHECK && elementsWalked < MAX_ELEMENTS_TO_WALK) {
            const root = roots.shift();
            rootsChecked += 1;

            const directRootMatch = root === document ? null : root.querySelector?.(selector);
            if (directRootMatch) return directRootMatch;

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
            let element;
            while ((element = walker.nextNode()) && elementsWalked < MAX_ELEMENTS_TO_WALK) {
                elementsWalked += 1;
                if (element.shadowRoot) roots.push(element.shadowRoot);
            }
        }

        return null;
    }

    // Initialize cache and listener
    if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get('logoReplaceEnabled', (data) => {
            if (chrome.runtime.lastError) {
                console.error('Error retrieving logoReplaceEnabled setting:', chrome.runtime.lastError);
                return;
            }
            if (data.logoReplaceEnabled !== undefined) {
                isLogoReplaceEnabled = data.logoReplaceEnabled;
            }
            // Run initial check after fetching setting
            checkAndReplaceLogo();
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.logoReplaceEnabled) {
                setLogoReplaceEnabled(changes.logoReplaceEnabled.newValue);
            }
        });
    }

    function replaceLogo() {
        // Reloading an unpacked extension invalidates content scripts that are
        // already running. Exit before touching Prisma's native logo; the page
        // refresh that loads the new extension instance will retry normally.
        let replacementLogoUrl;
        try {
            if (!chrome.runtime?.id) return;
            replacementLogoUrl = chrome.runtime.getURL('icon.png');
        } catch {
            return;
        }

        const uniquePath = findInHeaderShadowRoots('path[d="M9.23616 0C4.13364 0 0 3.78471 0 8.455C0 13.1253 4.13364 16.91 9.23616 16.91"]');
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
            newLogoImg.src = replacementLogoUrl;
            newLogoImg.style.width = '32px';
            newLogoImg.style.height = '28px';
            newLogoImg.style.objectFit = 'contain';
            newLogoImg.className = 'custom-prisma-logo';

            logoContainer.appendChild(newLogoImg);
        }
    }

    function restoreOriginalLogo() {
        const customLogoImg = findInHeaderShadowRoots('img.custom-prisma-logo');
        if (customLogoImg) {
            const logoContainer = customLogoImg.parentElement;
            if (logoContainer && logoContainer.dataset.originalSvgContent) {
                const template = document.createElement('template');
                template.innerHTML = logoContainer.dataset.originalSvgContent;
                const originalSvg = template.content.firstElementChild;
                if (originalSvg && !logoContainer.querySelector('svg')) {
                    logoContainer.insertBefore(originalSvg, customLogoImg);
                }
                customLogoImg.remove();
            } else if (logoContainer) {
                customLogoImg.remove();
            }
        }
    }

    function checkAndReplaceLogo() {
        if (isLogoReplaceEnabled !== false) {
            replaceLogo();
        } else {
            restoreOriginalLogo();
        }
    }

    function setLogoReplaceEnabled(enabled) {
        isLogoReplaceEnabled = enabled;
        checkAndReplaceLogo();
    }

    function shouldReplaceLogoOnThisPage() {
        if (typeof window === 'undefined' || !window.location || !window.location.href) {
            return false;
        }
        const { hostname } = new URL(window.location.href);
        const allowedDomains = ['aura.mediaocean.com', 'prisma.mediaocean.com', 'go.demo.mediaocean.com'];

        // Logo replacement itself is still gated by the user-controlled
        // `logoReplaceEnabled` setting; this function only defines where
        // the feature is *allowed* to run.
        return allowedDomains.some(domain => hostname.endsWith(domain));
    }

    // Expose the functions to the global scope
    window.logoFeature = {
        checkAndReplaceLogo,
        setLogoReplaceEnabled,
        shouldReplaceLogoOnThisPage
    };
})();
