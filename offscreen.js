/**
 * @fileoverview Offscreen document script for the Ops Toolshed extension.
 * Handles tasks that cannot be performed in the service worker, such as
 * playing audio and accessing the clipboard via `document.execCommand`.
 */

/**
 * Listener for messages from the extension.
 * Handles actions: 'playAlarm', 'readClipboard', 'copyToClipboard'.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'playAlarm') {
        (async () => {
            try {
                const audio = new Audio(message.sound);
                await audio.play();
            } catch (error) {
                console.error('Error playing audio in offscreen document:', error);
            }
        })();
        // No response needed for this action
    } else if (message.action === 'readClipboard') {
        // Use the 'execCommand' method for robust clipboard access in offscreen documents.
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        textarea.focus();

        try {
            const success = document.execCommand('paste');
            if (success) {
                const text = textarea.value;
                sendResponse({ status: 'success', text: text });
            } else {
                sendResponse({ status: 'error', message: 'Unable to paste from clipboard.' });
            }
        } catch (error) {
            console.error('Error reading clipboard in offscreen document:', error);
            sendResponse({ status: 'error', message: error.message });
        } finally {
            document.body.removeChild(textarea);
        }

        // This is a synchronous action in this case, but we keep `return true`
        // in case we ever need async operations within the try/catch.
        return true;
    } else if (message.action === 'copyToClipboard') {
        const textarea = document.createElement('textarea');
        textarea.value = message.text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            const success = document.execCommand('copy');
            sendResponse({ status: success ? 'success' : 'error' });
        } catch (error) {
            sendResponse({ status: 'error', message: error.message });
        } finally {
            document.body.removeChild(textarea);
        }
        return true;
    }
});
