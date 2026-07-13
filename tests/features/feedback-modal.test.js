/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const feedbackModalScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/feedback-modal.js'),
    'utf8'
);

function setupFeedbackModal(savedName = '') {
    const scheduledTimers = [];

    window.requestAnimationFrame = callback => callback();
    jest.spyOn(window, 'setTimeout').mockImplementation((callback, delay) => {
        scheduledTimers.push({ callback, delay });
        return scheduledTimers.length;
    });
    jest.spyOn(window, 'clearTimeout').mockImplementation(() => {});
    window.chrome = {
        storage: {
            local: {
                get: jest.fn((keys, callback) => callback(
                    savedName ? { opsToolshed_userName: savedName } : {}
                )),
                set: jest.fn()
            }
        }
    };

    window.eval(feedbackModalScript);

    return {
        window,
        document: window.document,
        feedbackModal: window.feedbackModalFeature,
        scheduledTimers
    };
}

function completeFeedbackForm(document) {
    document.getElementById('otf-section').value = 'Reminders';
    document.getElementById('otf-type').value = 'Bug Report';
    document.getElementById('otf-tip').value = 'The reminder did not appear.';
    document.getElementById('otf-ideaBy').value = 'Campaign team';
    document.getElementById('otf-name').value = 'Harry';
}

describe('Feedback Modal behaviour', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        delete window.feedbackModalFeature;
        delete window.requestAnimationFrame;
        jest.restoreAllMocks();
    });

    test('opens once with the saved user name', () => {
        const { document, feedbackModal } = setupFeedbackModal('Harry');

        feedbackModal.open();
        feedbackModal.open();

        expect(document.querySelectorAll('#ops-toolshed-feedback-root')).toHaveLength(1);
        expect(document.getElementById('otf-name').value).toBe('Harry');
        expect(document.querySelector('.otf-step-indicator').textContent).toBe('1/2');
    });

    test('keeps the user on the form and explains when required fields are missing', () => {
        const { document, feedbackModal } = setupFeedbackModal();

        feedbackModal.open();
        document.getElementById('otf-next-btn').click();

        expect(document.querySelector('.otf-step-indicator').textContent).toBe('1/2');
        expect(document.querySelector('.otf-toast').textContent).toBe('Please fill in all fields');
        expect(document.querySelector('.otf-toast').classList).toContain('error');
    });

    test('advances completed feedback, remembers the name, and allows returning to the form', () => {
        const { window, document, feedbackModal } = setupFeedbackModal();

        feedbackModal.open();
        completeFeedbackForm(document);
        document.getElementById('otf-next-btn').click();

        expect(document.querySelector('.otf-step-indicator').textContent).toBe('2/2');
        expect(document.getElementById('otf-next-btn').textContent).toBe('Submit');
        expect(window.chrome.storage.local.set).toHaveBeenCalledWith({
            opsToolshed_userName: 'Harry'
        });

        document.getElementById('otf-back-btn').click();
        expect(document.querySelector('.otf-step-indicator').textContent).toBe('1/2');
        expect(document.getElementById('otf-next-btn').textContent).toBe('Next');
    });

    test('shows confirmation when completed feedback is submitted', () => {
        const { document, feedbackModal, scheduledTimers } = setupFeedbackModal();

        feedbackModal.open();
        completeFeedbackForm(document);
        document.getElementById('otf-next-btn').click();
        document.getElementById('otf-next-btn').click();

        expect(document.querySelector('.otf-toast').textContent).toBe('Email opening: look for it now.');
        expect(document.querySelector('.otf-toast').classList).toContain('success');
        expect(scheduledTimers.some(timer => timer.delay === 500)).toBe(true);
    });

    test('animates closed before removing the modal', () => {
        const { document, feedbackModal, scheduledTimers } = setupFeedbackModal();

        feedbackModal.open();
        document.querySelector('.otf-btn-close').click();

        const root = document.getElementById('ops-toolshed-feedback-root');
        const closeTimer = scheduledTimers.find(timer => timer.delay === 200);
        expect(root.classList).toContain('otf-closing');
        expect(closeTimer).toBeDefined();

        closeTimer.callback();
        expect(document.getElementById('ops-toolshed-feedback-root')).toBeNull();
        expect(feedbackModal.root).toBeNull();
    });
});
