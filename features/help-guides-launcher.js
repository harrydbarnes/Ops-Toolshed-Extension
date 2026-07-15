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
                min-height: 44px;
                padding: 0 16px 0 10px;
                border: 1px solid rgba(255, 255, 255, 0.24);
                border-radius: 999px;
                background: #06088d;
                box-shadow: 0 4px 14px rgba(6, 8, 141, 0.24);
                color: #fff;
                font: 600 14px/1.2 "Outfit", "Segoe UI", sans-serif;
                letter-spacing: 0.01em;
                cursor: pointer;
                transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
            }
            #${BUTTON_ID}:hover {
                background: #05066f;
                box-shadow: 0 6px 18px rgba(6, 8, 141, 0.3);
                transform: translateY(-1px);
            }
            #${BUTTON_ID}:active {
                box-shadow: 0 3px 10px rgba(6, 8, 141, 0.24);
                transform: translateY(0);
            }
            #${BUTTON_ID}:focus-visible {
                outline: 3px solid #ff4087;
                outline-offset: 2px;
            }
            #${BUTTON_ID} .toolshed-help-guides-icon {
                display: grid;
                width: 26px;
                height: 26px;
                place-items: center;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.14);
                color: #fff;
            }
            #${BUTTON_ID} .toolshed-help-guides-icon svg {
                width: 16px;
                height: 16px;
                fill: none;
                stroke: currentColor;
                stroke-linecap: round;
                stroke-linejoin: round;
                stroke-width: 1.8;
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
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const iconSvg = document.createElementNS(svgNamespace, 'svg');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        const iconPath = document.createElementNS(svgNamespace, 'path');
        iconPath.setAttribute('d', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm16 0A2.5 2.5 0 0 0 17.5 3H15a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h2.5a2.5 2.5 0 0 1 2.5 2.5v-15Z');
        iconSvg.appendChild(iconPath);
        icon.appendChild(iconSvg);

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
