(function() {
    'use strict';

    // Applies a smaller font size to the chat window
    function applyFontSizeChange(enabled) {
        const styleId = 'live-chat-font-style';
        let style = document.getElementById(styleId);

        if (!enabled) {
            if (style) style.remove();
            return;
        }

        if (style) return;

        style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            html[style*="font-size: 14px"] {
                font-size: 12px !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Makes the chat window resizable from the top
    function makeChatResizable(enabled, webWidget) {
        const handleId = 'resizable-chat-handle';
        let handle = document.getElementById(handleId);

        if (!enabled) {
            if (handle) handle.remove();
            return null;
        }

        if (handle) return handle;

        handle = document.createElement('div');
        handle.id = handleId; // Styles are in content.css

        document.body.appendChild(handle);

        const updateHandlePosition = () => {
            const widgetRect = webWidget.getBoundingClientRect();
            Object.assign(handle.style, {
                width: `${widgetRect.width}px`,
                top: `${widgetRect.top}px`,
                right: `${window.innerWidth - widgetRect.right}px`,
                display: webWidget.style.display
            });
        };

        updateHandlePosition();

        let isResizing = false;
        let initialMouseY = 0;
        let initialWidgetTop = 0;
        let initialWidgetHeight = 0;

        const onMouseDown = (e) => {
            isResizing = true;
            document.body.style.userSelect = 'none';

            const widgetRect = webWidget.getBoundingClientRect();
            initialMouseY = e.clientY;
            initialWidgetTop = widgetRect.top;
            initialWidgetHeight = widgetRect.height;

            webWidget.style.bottom = 'auto';

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);

            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - initialMouseY;
            const newTop = initialWidgetTop + deltaY;
            const newHeight = initialWidgetHeight - deltaY;

            if (newHeight > 100 && newHeight < (window.innerHeight - 40)) {
                webWidget.style.top = `${newTop}px`;
                webWidget.style.height = `${newHeight}px`;
                handle.style.top = `${newTop}px`;
            }
        };

        const onMouseUp = () => {
            isResizing = false;
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);

        return handle;
    }

    // Creates the chat launcher button
    function createLauncher(webWidget, resizerHandle) {
        const launcherId = 'launcher-button-container';
        if (document.getElementById(launcherId)) return document.getElementById(launcherId);

        const launcherContainer = document.createElement('div');
        launcherContainer.id = launcherId;

        const buttonHTML = `
            <button>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 16">
                    <path d="M1.3,16c-0.7,0-1.1-0.3-1.2-0.8c-0.3-0.8,0.5-1.3,0.8-1.5c0.6-0.4,0.9-0.7,1-1c0-0.2-0.1-0.4-0.3-0.7c0,0,0-0.1-0.1-0.1 C0.5,10.6,0,9,0,7.4C0,3.3,3.4,0,7.5,0C11.6,0,15,3.3,15,7.4s-3.4,7.4-7.5,7.4c-0.5,0-1-0.1-1.5-0.2C3.4,15.9,1.5,16,1.5,16 C1.4,16,1.4,16,1.3,16z M3.3,10.9c0.5,0.7,0.7,1.5,0.6,2.2c0,0.1-0.1,0.3-0.1,0.4c0.5-0.2,1-0.4,1.6-0.7c0.2-0.1,0.4-0.2,0.6-0.1 c0,0,0.1,0,0.1,0c0.4,0.1,0.9,0.2,1.4,0.2c3,0,5.5-2.4,5.5-5.4S10.5,2,7.5,2C4.5,2,2,4.4,2,7.4c0,1.2,0.4,2.4,1.2,3.3 C3.2,10.8,3.3,10.8,3.3,10.9z"></path>
                </svg>
                <span>Chat</span>
            </button>
        `;
        launcherContainer.innerHTML = buttonHTML;
        document.body.appendChild(launcherContainer);

        launcherContainer.querySelector('button').addEventListener('click', () => {
            launcherContainer.style.display = 'none';
            if (webWidget) {
                webWidget.style.display = 'block';
                setTimeout(() => { webWidget.style.opacity = '1'; }, 50);
            }
            if (resizerHandle) {
                const widgetRect = webWidget.getBoundingClientRect();
                resizerHandle.style.top = `${widgetRect.top}px`;
                resizerHandle.style.display = 'block';
            }
        });
        return launcherContainer;
    }

    // Handles the scheduled display of the chat widget
    function handleScheduledChat(enabled, webWidget, resizerHandle) {
        let launcher = document.getElementById('launcher-button-container');

        if (!enabled) {
            if (launcher) launcher.style.display = 'none';
            webWidget.style.display = 'block';
            if (resizerHandle) resizerHandle.style.display = 'block';
            return;
        }

        if (!launcher) {
            launcher = createLauncher(webWidget, resizerHandle);
        }

        const now = new Date();
        const currentHour = now.getHours();
        const isScheduledTime = currentHour >= 10 && currentHour < 12;

        if (isScheduledTime) {
            launcher.style.display = 'block';
            webWidget.style.display = 'none';
            if (resizerHandle) resizerHandle.style.display = 'none';
        } else {
            launcher.style.display = 'none';
            webWidget.style.display = 'none';
            if (resizerHandle) resizerHandle.style.display = 'none';
        }
    }

    // Initializes all chat enhancement features
    function initializeChatEnhancements() {
        const webWidget = document.getElementById('webWidget');
        if (!webWidget || webWidget.dataset.chatEnhancementsInitialized) return;

        chrome.storage.sync.get([
            'fontSizeToggleEnabled',
            'resizableChatToggleEnabled',
            'scheduledChatToggleEnabled'
        ], (settings) => {
            applyFontSizeChange(settings.fontSizeToggleEnabled);
            const resizerHandle = makeChatResizable(settings.resizableChatToggleEnabled, webWidget);
            handleScheduledChat(settings.scheduledChatToggleEnabled, webWidget, resizerHandle);

            webWidget.dataset.chatEnhancementsInitialized = 'true';
        });
    }

    window.liveChatEnhancements = {
        initialize: initializeChatEnhancements
    };
})();