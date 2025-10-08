(function() {
    'use strict';

    // Applies a smaller font size to the chat window
    function applyFontSizeChange(enabled) {
        if (!enabled) return;
        if (document.getElementById('live-chat-font-style')) return;

        const style = document.createElement('style');
        style.id = 'live-chat-font-style';
        style.textContent = `
            html[style*="font-size: 14px"] {
                font-size: 12px !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Makes the chat window resizable
    function makeChatResizable(enabled, webWidget) {
        if (!enabled) return;
        if (document.getElementById('resizable-chat-handle')) return;

        const handle = document.createElement('div');
        handle.id = 'resizable-chat-handle';
        Object.assign(handle.style, {
            width: webWidget.style.width,
            height: '10px',
            backgroundColor: '#cccccc',
            cursor: 'ns-resize',
            position: 'fixed',
            right: webWidget.style.right,
            zIndex: '999999',
            borderTop: '1px solid #aeaeae'
        });

        const widgetHeight = parseFloat(webWidget.style.height);
        handle.style.bottom = `${widgetHeight}px`;
        document.body.appendChild(handle);

        let isResizing = false;
        handle.addEventListener('mousedown', () => {
            isResizing = true;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 100 && newHeight < (window.innerHeight - 80)) {
                webWidget.style.height = `${newHeight}px`;
                handle.style.bottom = `${newHeight}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.userSelect = '';
        });
    }

    // Creates the chat launcher button
    function createLauncher() {
        if (document.getElementById('launcher-button-container')) return;

        const launcherContainer = document.createElement('div');
        launcherContainer.id = 'launcher-button-container';
        launcherContainer.style.cssText = 'position: fixed; bottom: 10px; right: 20px; z-index: 999998; width: 107px; height: 50px;';

        const buttonHTML = `
            <button style="width: 100%; height: 100%; background-color: #007bff; color: white; border-radius: 25px; display: flex; align-items: center; justify-content: center; padding: 0 15px; cursor: pointer; border: none; font-family: sans-serif; font-size: 16px;">
                <span style="margin-right: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 16" style="fill: white; width: 20px; height: 20px;">
                        <path d="M1.3,16c-0.7,0-1.1-0.3-1.2-0.8c-0.3-0.8,0.5-1.3,0.8-1.5c0.6-0.4,0.9-0.7,1-1c0-0.2-0.1-0.4-0.3-0.7c0,0,0-0.1-0.1-0.1 C0.5,10.6,0,9,0,7.4C0,3.3,3.4,0,7.5,0C11.6,0,15,3.3,15,7.4s-3.4,7.4-7.5,7.4c-0.5,0-1-0.1-1.5-0.2C3.4,15.9,1.5,16,1.5,16 C1.4,16,1.4,16,1.3,16z M3.3,10.9c0.5,0.7,0.7,1.5,0.6,2.2c0,0.1-0.1,0.3-0.1,0.4c0.5-0.2,1-0.4,1.6-0.7c0.2-0.1,0.4-0.2,0.6-0.1 c0,0,0.1,0,0.1,0c0.4,0.1,0.9,0.2,1.4,0.2c3,0,5.5-2.4,5.5-5.4S10.5,2,7.5,2C4.5,2,2,4.4,2,7.4c0,1.2,0.4,2.4,1.2,3.3 C3.2,10.8,3.3,10.8,3.3,10.9z"></path>
                    </svg>
                </span>
                <span>Chat</span>
            </button>
        `;
        launcherContainer.innerHTML = buttonHTML;
        document.body.appendChild(launcherContainer);

        launcherContainer.querySelector('button').addEventListener('click', () => {
            const webWidget = document.getElementById('webWidget');
            launcherContainer.style.display = 'none';
            if (webWidget) {
                webWidget.style.display = 'block';
                setTimeout(() => { webWidget.style.opacity = '1'; }, 50);
            }
        });
        return launcherContainer;
    }

    // Handles the scheduled display of the chat widget
    function handleScheduledChat(enabled, webWidget) {
        if (!enabled) return false;

        const now = new Date();
        const currentHour = now.getHours();
        const isScheduledTime = currentHour >= 10 && currentHour < 12;
        let launcher = document.getElementById('launcher-button-container');

        if (isScheduledTime) {
            if (!launcher) launcher = createLauncher();
            launcher.style.display = 'block';
            webWidget.style.display = 'none';
            webWidget.style.opacity = '0';
        } else {
            webWidget.style.display = 'none';
            webWidget.style.opacity = '0';
            if (launcher) launcher.style.display = 'none';
        }
        return true;
    }

    // Initializes all chat enhancement features
    function initializeChatEnhancements() {
        const webWidget = document.getElementById('webWidget');
        if (!webWidget) return;

        chrome.storage.sync.get([
            'fontSizeToggleEnabled',
            'resizableChatToggleEnabled',
            'scheduledChatToggleEnabled'
        ], (settings) => {
            const schedulerHandled = handleScheduledChat(settings.scheduledChatToggleEnabled, webWidget);

            if (webWidget.style.display === 'none' && schedulerHandled) {
                return;
            }

            applyFontSizeChange(settings.fontSizeToggleEnabled);
            makeChatResizable(settings.resizableChatToggleEnabled, webWidget);
        });
    }

    window.liveChatEnhancements = {
        initialize: initializeChatEnhancements
    };
})();