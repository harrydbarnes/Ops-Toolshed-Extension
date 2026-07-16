(function() {
    const TRAINING_URL = 'https://wpponlinetraining.com/course/view.php?id=115';
    let closeTimer = null;
    let toastTimer = null;

    function initialize() {
        const trigger = document.getElementById('need-more-approvers');
        const root = document.getElementById('approver-training-root');
        const closeButton = document.getElementById('close-approver-training');
        const copyButton = document.getElementById('copy-approver-training');
        const toast = document.getElementById('approver-training-toast');
        if (!trigger || !root || !closeButton || !copyButton || !toast || root.dataset.initialized) return;
        root.dataset.initialized = 'true';

        const open = () => {
            window.clearTimeout(closeTimer);
            root.classList.remove('otf-closing');
            root.hidden = false;
            window.requestAnimationFrame(() => closeButton.focus());
        };

        const close = () => {
            if (root.hidden || root.classList.contains('otf-closing')) return;
            root.classList.add('otf-closing');
            closeTimer = window.setTimeout(() => {
                root.hidden = true;
                root.classList.remove('otf-closing');
                trigger.focus();
            }, 200);
        };

        const copy = async () => {
            try {
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(TRAINING_URL);
                else await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: TRAINING_URL });
                toast.textContent = 'Training link copied';
                toast.classList.remove('error');
                toast.classList.add('success', 'visible');
                copyButton.querySelector('span').textContent = 'Copied';
                window.clearTimeout(toastTimer);
                toastTimer = window.setTimeout(() => {
                    toast.classList.remove('visible');
                    copyButton.querySelector('span').textContent = 'Copy training link';
                }, 2200);
            } catch {
                toast.textContent = 'Could not copy the training link';
                toast.classList.remove('success');
                toast.classList.add('error', 'visible');
            }
        };

        trigger.addEventListener('click', open);
        closeButton.addEventListener('click', close);
        root.querySelector('[data-training-close]')?.addEventListener('click', close);
        copyButton.addEventListener('click', copy);
        root.addEventListener('keydown', event => {
            if (event.key === 'Escape') close();
        });

        window.approverTrainingModalFeature = { open, close, copy, trainingUrl: TRAINING_URL };
    }

    initialize();
})();
