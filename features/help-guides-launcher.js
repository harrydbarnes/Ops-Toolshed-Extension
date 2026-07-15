(function() {
    const BUTTON_ID = 'toolshed-help-guides-launcher';
    const STYLE_ID = 'toolshed-help-guides-launcher-styles';

    function openHelpGuides(event) {
        event?.preventDefault();
        event?.stopPropagation();

        chrome.runtime.sendMessage({ action: 'openHelpGuides' })
            .catch(error => console.warn('Could not open Help Guides:', error.message));
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                position: fixed;
                right: 18px;
                bottom: 20px;
                z-index: 2147483000;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                min-height: 40px;
                padding: 0 15px 0 11px;
                border: 1px solid rgba(255, 255, 255, 0.22);
                border-radius: 999px;
                background: #18324a;
                box-shadow: 0 8px 24px rgba(12, 31, 49, 0.24);
                color: #fff;
                font: 600 13px/1.2 "Segoe UI", sans-serif;
                letter-spacing: 0.01em;
                cursor: pointer;
                transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
            }
            #${BUTTON_ID}:hover {
                background: #214664;
                box-shadow: 0 10px 28px rgba(12, 31, 49, 0.32);
                transform: translateY(-2px);
            }
            #${BUTTON_ID}:focus-visible {
                outline: 3px solid #f3b44b;
                outline-offset: 3px;
            }
            #${BUTTON_ID} .toolshed-help-guides-icon {
                display: grid;
                width: 22px;
                height: 22px;
                place-items: center;
                border-radius: 50%;
                background: #f3b44b;
                color: #18324a;
                font: 800 14px/1 Georgia, serif;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureLauncher() {
        if (window.top !== window.self || document.getElementById(BUTTON_ID)) return;

        injectStyles();
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.setAttribute('aria-label', 'Open Help Guides');

        const icon = document.createElement('span');
        icon.className = 'toolshed-help-guides-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '?';

        const label = document.createElement('span');
        label.textContent = 'Help Guides';
        button.append(icon, label);
        button.addEventListener('click', openHelpGuides);
        document.body.appendChild(button);
    }

    window.helpGuidesLauncherFeature = {
        initialize: ensureLauncher,
        ensureLauncher,
        openHelpGuides
    };
})();
