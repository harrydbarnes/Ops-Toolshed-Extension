const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/approver-pasting.js'),
    'utf8'
);

describe('Internal Approval recipient history controls', () => {
    let dom;
    let window;
    let document;
    let storedRecipients;

    async function flushPromises() {
        await Promise.resolve();
        await Promise.resolve();
    }

    function setupDom(initiallyRemoved = []) {
        storedRecipients = initiallyRemoved;
        dom = new JSDOM(`<!doctype html><html><body>
            <div class="control-group">
                <label>To</label>
                <ul class="select2-choices"><li><input class="select2-input"></li></ul>
            </div>
            <div class="select2-drop-active" style="display: block">
                <ul class="select2-results">
                    <li class="select2-result-selectable"><div class="select2-result-label">first@example.com</div></li>
                    <li class="select2-result-selectable"><div class="select2-result-label">second@example.com</div></li>
                </ul>
            </div>
        </body></html>`, { runScripts: 'dangerously' });
        window = dom.window;
        document = window.document;
        window.chrome = {
            storage: {
                local: {
                    get: jest.fn().mockResolvedValue({ removedInternalApprovalRecipients: initiallyRemoved }),
                    set: jest.fn(items => {
                        storedRecipients = items.removedInternalApprovalRecipients;
                        return Promise.resolve();
                    })
                }
            },
            runtime: { sendMessage: jest.fn() }
        };

        document.querySelector('.select2-input').focus();
        const script = document.createElement('script');
        script.textContent = featureScript;
        document.body.appendChild(script);
    }

    afterEach(() => dom?.window.close());

    test('adds individual remove controls and persists the selected removal', async () => {
        setupDom();
        const firstResult = document.querySelector('.select2-result-selectable');
        const selectRecipient = jest.fn();
        firstResult.addEventListener('mouseup', selectRecipient);

        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();

        const removeButtons = document.querySelectorAll('.ops-toolshed-recipient-history-remove');
        expect(removeButtons).toHaveLength(2);
        expect(document.querySelector('.ops-toolshed-recipient-history-clear')).not.toBeNull();
        expect(document.querySelector('.ops-toolshed-recipient-history-email').textContent).toBe('first@example.com');

        removeButtons[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        removeButtons[0].dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        removeButtons[0].click();
        await flushPromises();

        expect(document.querySelector('.select2-results').textContent).not.toContain('first@example.com');
        expect(storedRecipients).toEqual(['first@example.com']);
        expect(selectRecipient).not.toHaveBeenCalled();
    });

    test('keeps Prisma recipient history hidden until it has been filtered', async () => {
        setupDom(['first@example.com']);
        window.approverPastingFeature.handleApproverPasting();

        const toInput = document.querySelector('.select2-input');
        toInput.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
        expect(document.body.classList.contains('ops-toolshed-recipient-history-pending')).toBe(true);

        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();

        expect(document.body.classList.contains('ops-toolshed-recipient-history-pending')).toBe(false);
        expect(document.querySelector('.select2-results').textContent).not.toContain('first@example.com');
    });

    test('filters previously removed recipients and clears all visible recipients', async () => {
        setupDom(['first@example.com']);

        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();

        expect(document.querySelector('.select2-results').textContent).not.toContain('first@example.com');
        document.querySelector('.ops-toolshed-recipient-history-clear').click();
        await flushPromises();

        expect(document.querySelector('.select2-result-selectable')).toBeNull();
        expect(storedRecipients).toEqual(['first@example.com', 'second@example.com']);
    });
});
