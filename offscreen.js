chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const isClipboardAction = message?.action === 'readClipboard' || message?.action === 'copyToClipboard';
    if (isClipboardAction && message.target !== 'offscreen') return false;

    const isInternalExtensionSender = sender?.id === chrome.runtime.id && !sender?.tab;
    if (isClipboardAction && !isInternalExtensionSender) {
        sendResponse({ status: 'error', message: 'Unauthorized clipboard request.' });
        return false;
    }

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
