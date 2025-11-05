(function() {
    'use strict';

    function handleGmiChatButton() {
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

            const clientName = clientNameElement ? clientNameElement.textContent.trim() : 'CLIENT_NAME_HERE';
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