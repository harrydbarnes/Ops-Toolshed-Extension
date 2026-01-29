(function() {
    'use strict';

    let isEnabled = true;

    chrome.storage.sync.get('gmiChatShortcutEnabled', (data) => {
        isEnabled = data.gmiChatShortcutEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.gmiChatShortcutEnabled) {
            isEnabled = changes.gmiChatShortcutEnabled.newValue !== false;
            if (!isEnabled) {
                const btn = document.querySelector('.gmi-chat-button');
                if (btn) btn.remove();
            }
        }
    });

    function formatClientName(name) {
        // If the name is all uppercase and contains spaces (multi-word), convert it to title case.
        // This avoids converting single-word acronyms like 'NASA' to 'Nasa'.
        if (name && name === name.toUpperCase() && name.includes(' ')) {
            return name.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
        }
        return name;
    }

    function handleGmiChatButton() {
        if (!isEnabled) return;

        const workflowWidget = document.querySelector('.workflow-widget-wrapper');
        if (!workflowWidget || workflowWidget.querySelector('.gmi-chat-button')) {
            return;
        }

        const gmiChatButton = document.createElement('button');
        gmiChatButton.textContent = 'GMI Chat';
        gmiChatButton.className = 'filter-button prisma-paste-button gmi-chat-button';

        gmiChatButton.addEventListener('click', () => {
            // Use attribute "ends-with" selectors for more resilience
            const clientNameElement = document.querySelector('[id$="-csl-product-label"]');
            const campaignNameElement = document.querySelector('[id$="-campaign-name"]');

            const unformattedClientName = clientNameElement ? clientNameElement.textContent.trim() : 'CLIENT_NAME_HERE';
            const clientName = formatClientName(unformattedClientName);
            const campaignName = campaignNameElement ? (campaignNameElement.getAttribute('title') || campaignNameElement.textContent || '').trim() : 'CAMPAIGN_NAME_HERE';
            const currentUrl = window.location.href;

            const message = `${clientName} - ${campaignName}`;
            const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=edwin.balagopalan@wppmedia.com,ellie.vigors@wppmedia.com,harry.barnes@wppmedia.com,isobel.shaw@wppmedia.com,jett.hudson@wppmedia.com,lauren.pringle@wppmedia.com,matt.akerman@wppmedia.com,mihaela.lupu@wppmedia.com,rita.bressi@wppmedia.com,santiago.feberero@wppmedia.com,scott.moore@wppmedia.com,shreya.gurung@wppmedia.com,trish.costa@wppmedia.com&message=${encodeURIComponent(message)}%20${encodeURIComponent(currentUrl)}`;

            window.open(teamsUrl, '_blank');
        });

        workflowWidget.appendChild(gmiChatButton);
    }

    window.gmiChatFeature = {
        handleGmiChatButton
    };
})();
