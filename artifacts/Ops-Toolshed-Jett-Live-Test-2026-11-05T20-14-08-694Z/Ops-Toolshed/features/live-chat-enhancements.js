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

        // Clean up previous listener if it exists
        if (webWidget._resizeListener) {
            window.removeEventListener('resize', webWidget._resizeListener);
            delete webWidget._resizeListener;
        }

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
        window.addEventListener('resize', updateHandlePosition);

        let isResizing = false;
        let initialMouseY = 0;
        let initialWidgetTop = 0;
        let initialWidgetHeight = 0;

        const MIN_CHAT_HEIGHT = 100;
        const BOTTOM_MARGIN = 40;

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

            if (newHeight > MIN_CHAT_HEIGHT && newHeight < (window.innerHeight - BOTTOM_MARGIN)) {
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

    // Initializes all chat enhancement features
    function initializeChatEnhancements() {
        const webWidget = document.getElementById('webWidget');
        if (!webWidget || webWidget.dataset.chatEnhancementsInitialized) return;

        chrome.storage.sync.get([
            'fontSizeToggleEnabled',
            'resizableChatToggleEnabled'
        ], (settings) => {
            applyFontSizeChange(settings.fontSizeToggleEnabled);
            makeChatResizable(settings.resizableChatToggleEnabled, webWidget);

            webWidget.dataset.chatEnhancementsInitialized = 'true';
        });
    }

    window.liveChatEnhancements = {
        initialize: initializeChatEnhancements
    };
})();
