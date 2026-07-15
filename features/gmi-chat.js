(function() {
    'use strict';

    let isEnabled = true;

    chrome.storage.sync.get('gmiChatShortcutEnabled', (data) => {
        isEnabled = data.gmiChatShortcutEnabled !== false;
        document.body.classList.toggle('gmi-chat-enabled', isEnabled);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.gmiChatShortcutEnabled) {
            isEnabled = changes.gmiChatShortcutEnabled.newValue !== false;
            document.body.classList.toggle('gmi-chat-enabled', isEnabled);
            if (!isEnabled) {
                const btn = document.querySelector('.gmi-chat-button');
                if (btn) btn.remove();
            }
        }
    });

    function getElementValue(element) {
        return (element?.getAttribute('title') || element?.textContent || '').trim();
    }

    function getCampaignName() {
        const campaignNameElement = document.querySelector('.mo-campaign-name-wrapper') ||
            document.querySelector('[id$="-campaign-name"]');
        return getElementValue(campaignNameElement) || 'CAMPAIGN_NAME_HERE';
    }

    function handleGmiChatButton() {
        if (!isEnabled) return;

        const workflowWidget = document.querySelector('.workflow-widget-wrapper');
        if (!workflowWidget || workflowWidget.querySelector('.gmi-chat-button')) {
            return;
        }

        const gmiChatButton = document.createElement('button');
        gmiChatButton.textContent = 'GMI Chat';
        
        // REWORKED: Purely standalone class. No 'prisma-paste-button' or 'filter-button'.
        gmiChatButton.className = 'gmi-chat-button';

        gmiChatButton.addEventListener('click', () => {
            const campaignName = getCampaignName();
            const currentUrl = window.location.href;

            const message = campaignName;
            const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=edwin.balagopalan@wppmedia.com,ellie.vigors@wppmedia.com,harry.barnes@wppmedia.com,isobel.shaw@wppmedia.com,jett.hudson@wppmedia.com,lauren.pringle@wppmedia.com,matt.akerman@wppmedia.com,mihaela.lupu@wppmedia.com,rita.bressi@wppmedia.com,santiago.feberero@wppmedia.com,scott.moore@wppmedia.com,shreya.gurung@wppmedia.com,trish.costa@wppmedia.com&message=${encodeURIComponent(message)}%20${encodeURIComponent(currentUrl)}`;

            window.open(teamsUrl, '_blank');
        });

        workflowWidget.appendChild(gmiChatButton);
    }

    window.gmiChatFeature = {
        handleGmiChatButton
    };
})();
