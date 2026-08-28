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
    let storedSubmissionRecipients;

    async function flushPromises() {
        await Promise.resolve();
        await Promise.resolve();
    }

    function setupDom(initiallyRemoved = [], enabled = true, deferRemovedRecipients = false, options = {}) {
        storedRecipients = initiallyRemoved;
        storedSubmissionRecipients = options.submittedRecipients || {};
        const submittedRecipientDisplayEnabled = options.submittedRecipientDisplayEnabled !== false;
        let storageListener;
        let resolveRemovedRecipients;
        dom = new JSDOM(`<!doctype html><html><body>
            <div class="workflow-widget-wrapper">
                <div class="control-group">
                    <label>To</label>
                    <ul class="select2-choices"><li><input class="select2-input"></li></ul>
                </div>
            </div>
            <mo-side-panel class="approver-workflow-sidebar">
                <div class="workflow-sidebar-heading">WORKFLOW</div>
                <div class="workflow-sidebar-tabs"><span>Current</span><span>History</span></div>
                <mo-side-panel-tile class="workflow-sidebar-card mo-info active">
                    <div class="mo-label label label-info">SUBMITTED</div>
                </mo-side-panel-tile>
            </mo-side-panel>
            <div class="select2-drop-active" style="display: block">
                <ul class="select2-results">
                    <li class="select2-result-selectable"><div class="select2-result-label">first@example.com</div></li>
                    <li class="select2-result-selectable"><div class="select2-result-label">second@example.com</div></li>
                </ul>
            </div>
        </body></html>`, {
            url: options.url || 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123',
            runScripts: 'dangerously'
        });
        window = dom.window;
        document = window.document;
        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((_keys, callback) => callback({
                        approverSidebarEnhancementsEnabled: enabled,
                        approverSubmittedRecipientDisplayEnabled: submittedRecipientDisplayEnabled
                    }))
                },
                local: {
                    get: deferRemovedRecipients
                        ? jest.fn(() => new Promise(resolve => {
                            resolveRemovedRecipients = () => resolve({ removedInternalApprovalRecipients: initiallyRemoved });
                        }))
                        : jest.fn(keys => {
                            if (keys && Object.prototype.hasOwnProperty.call(keys, 'internalApprovalSubmittedRecipients')) {
                                return Promise.resolve({ internalApprovalSubmittedRecipients: storedSubmissionRecipients });
                            }
                            return Promise.resolve({ removedInternalApprovalRecipients: initiallyRemoved });
                        }),
                    set: jest.fn(items => {
                        if (Object.prototype.hasOwnProperty.call(items, 'removedInternalApprovalRecipients')) {
                            storedRecipients = items.removedInternalApprovalRecipients;
                        }
                        if (Object.prototype.hasOwnProperty.call(items, 'internalApprovalSubmittedRecipients')) {
                            storedSubmissionRecipients = items.internalApprovalSubmittedRecipients;
                        }
                        return Promise.resolve();
                    })
                },
                onChanged: {
                    addListener: jest.fn(listener => { storageListener = listener; })
                }
            },
            runtime: { sendMessage: jest.fn() }
        };
        window.utils = {
            waitForElement: jest.fn(selector => Promise.resolve(
                selector === '.select2-search-field input'
                    ? document.querySelector('.select2-input')
                    : document.querySelector('.select2-result-selectable')
            )),
            waitForElementToDisappear: jest.fn().mockResolvedValue(undefined)
        };

        document.querySelector('.select2-input').focus();
        const script = document.createElement('script');
        script.textContent = featureScript;
        document.body.appendChild(script);
        return {
            setEnabled(value) {
                storageListener({ approverSidebarEnhancementsEnabled: { newValue: value } }, 'sync');
            },
            setSubmittedRecipientDisplayEnabled(value) {
                storageListener({ approverSubmittedRecipientDisplayEnabled: { newValue: value } }, 'sync');
            },
            resolveRemovedRecipients: () => resolveRemovedRecipients?.()
        };
    }

    function installAndCapturePasteHandler() {
        let pasteHandler;
        const originalAddEventListener = window.HTMLButtonElement.prototype.addEventListener;
        const addEventListenerSpy = jest
            .spyOn(window.HTMLButtonElement.prototype, 'addEventListener')
            .mockImplementation(function(type, listener, options) {
                if (type === 'click' && this.textContent === 'Paste Approvers') {
                    pasteHandler = listener;
                }
                return originalAddEventListener.call(this, type, listener, options);
            });

        window.approverPastingFeature.handleApproverPasting();
        addEventListenerSpy.mockRestore();
        return {
            pasteButton: document.querySelector('.prisma-paste-button'),
            pasteHandler
        };
    }

    afterEach(() => dom?.window.close());

    test('responds to the Settings feature and restores controls without duplicates', async () => {
        const feature = setupDom([], false);
        window.approverPastingFeature.initialize();
        window.approverPastingFeature.handleApproverPasting();
        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();
        expect(document.querySelector('.prisma-paste-button')).toBeNull();
        expect(document.querySelector('.ops-toolshed-recipient-history-remove')).toBeNull();

        feature.setEnabled(true);
        await flushPromises();
        expect(document.querySelectorAll('.prisma-paste-button')).toHaveLength(2);
        expect(document.querySelectorAll('.ops-toolshed-recipient-history-remove')).toHaveLength(2);

        feature.setEnabled(false);
        expect(document.querySelector('.prisma-paste-button')).toBeNull();
        expect(document.querySelector('.ops-toolshed-recipient-history-remove')).toBeNull();
        expect(document.querySelector('.ops-toolshed-recipient-history-tooltip')).toBeNull();
        expect(document.body.classList.contains('ops-toolshed-recipient-history-pending')).toBe(false);

        feature.setEnabled(true);
        await flushPromises();
        expect(document.querySelectorAll('.prisma-paste-button')).toHaveLength(2);
        expect(document.querySelectorAll('.ops-toolshed-recipient-history-remove')).toHaveLength(2);
    });

    test('removes submitted-recipient display and tracking when the setting is disabled', async () => {
        const feature = setupDom([], false);
        storedSubmissionRecipients = {
            CP123: {
                emails: ['robert.walker@wppmedia.com'],
                capturedAt: 123
            }
        };
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Submitted</span></div>
        `);

        window.approverPastingFeature.initialize();
        feature.setEnabled(true);
        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const sidebar = document.querySelector('.approver-workflow-sidebar');
        expect(sidebar.querySelector('.ops-toolshed-submitted-recipients').textContent)
            .toBe('to: robert.walker@wppmedia.com');
        expect(workflowRoot.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();

        feature.setEnabled(false);
        expect(sidebar.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();

        feature.setEnabled(true);
        await flushPromises();
        expect(sidebar.querySelectorAll('.ops-toolshed-submitted-recipients')).toHaveLength(1);
    });

    test('does not fall back to the approval widget when the Workflow sidebar is closed', async () => {
        setupDom([], true, false, {
            submittedRecipients: {
                CP123: {
                    emails: ['robert.walker@wppmedia.com'],
                    capturedAt: 123
                }
            }
        });
        document.querySelector('.approver-workflow-sidebar').remove();
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Submitted</span></div>
        `);

        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        expect(workflowRoot.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();
    });

    test('allows submitted-recipient display to be toggled independently of the other approver enhancements', async () => {
        const feature = setupDom([], true, false, { submittedRecipientDisplayEnabled: false });
        const choices = document.querySelector('.select2-choices');
        choices.insertAdjacentHTML('afterbegin', `
            <li class="select2-search-choice"><div>robert.walker@wppmedia.com</div></li>
        `);
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Submitted</span></div>
        `);

        window.approverPastingFeature.initialize();
        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const sidebar = document.querySelector('.approver-workflow-sidebar');
        expect(sidebar.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();
        expect(document.querySelectorAll('.prisma-paste-button')).toHaveLength(2);

        feature.setSubmittedRecipientDisplayEnabled(true);
        await window.approverPastingFeature.handleSubmittedRecipientDisplay();
        expect(sidebar.querySelector('.ops-toolshed-submitted-recipients').textContent)
            .toBe('to: robert.walker@wppmedia.com');

        feature.setSubmittedRecipientDisplayEnabled(false);
        expect(sidebar.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();
        expect(document.querySelectorAll('.prisma-paste-button')).toHaveLength(2);
    });

    test('does not add delayed recipient-history controls after the feature is disabled', async () => {
        const feature = setupDom([], true, true);
        window.approverPastingFeature.initialize();

        feature.setEnabled(false);
        feature.resolveRemovedRecipients();
        await flushPromises();

        expect(document.querySelector('.prisma-paste-button')).toBeNull();
        expect(document.querySelector('.ops-toolshed-recipient-history-remove')).toBeNull();
    });

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

    test('lets Enter select an exact previously removed email and restores it to history', async () => {
        const previouslyRemovedEmail = 'robert.walker@wppmedia.com';
        setupDom([previouslyRemovedEmail]);
        const toInput = document.querySelector('.select2-input');
        const firstResult = document.querySelector('.select2-result-selectable');
        const selectRecipient = jest.fn();
        firstResult.querySelector('.select2-result-label').textContent = previouslyRemovedEmail;
        toInput.value = previouslyRemovedEmail;
        toInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && document.contains(firstResult)) selectRecipient();
        });

        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();

        expect(firstResult.isConnected).toBe(true);
        expect(firstResult.querySelector('.ops-toolshed-recipient-history-remove')).not.toBeNull();
        const enter = new window.KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true
        });
        toInput.dispatchEvent(enter);
        await flushPromises();

        expect(selectRecipient).toHaveBeenCalledTimes(1);
        expect(storedRecipients).toEqual([]);
    });

    test('provides an unclipped accessible tooltip instead of a native title popup', async () => {
        setupDom();

        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();

        const removeButton = document.querySelector('.ops-toolshed-recipient-history-remove');
        const tooltip = document.getElementById(removeButton.getAttribute('aria-describedby'));
        expect(removeButton.getAttribute('title')).toBeNull();
        expect(tooltip.parentElement).toBe(document.body);
        expect(tooltip.getAttribute('role')).toBe('tooltip');
        expect(tooltip.textContent).toBe('Hide this recipient from history');
        expect(tooltip.hidden).toBe(true);

        removeButton.dispatchEvent(new window.MouseEvent('mouseenter'));
        expect(tooltip.hidden).toBe(false);
        removeButton.dispatchEvent(new window.MouseEvent('mouseleave'));
        expect(tooltip.hidden).toBe(true);
    });

    test('places submitted recipients after the active Workflow tile label and shows an unclipped tooltip', async () => {
        setupDom([], true, false, {
            submittedRecipients: {
                CP123: {
                    emails: ['robert.walker@wppmedia.com'],
                    capturedAt: 123
                }
            }
        });
        const sidebar = document.querySelector('.approver-workflow-sidebar');
        const activeTile = sidebar.querySelector('mo-side-panel-tile');
        const submittedLabel = activeTile.querySelector('.mo-label.label');
        const historyTile = document.createElement('mo-side-panel-tile');
        historyTile.className = 'workflow-history completed';
        historyTile.innerHTML = '<div class="mo-label label">SUBMITTED</div>';
        activeTile.after(historyTile);

        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const display = activeTile.querySelector('.ops-toolshed-submitted-recipients');
        expect(display).not.toBeNull();
        expect(display.textContent).toBe('to: robert.walker@wppmedia.com');
        expect(display.previousElementSibling).toBe(submittedLabel);
        expect(display.style.fontFamily).toBe('Avenir, Arial, sans-serif');
        expect(display.style.fontSize).toBe('11px');
        expect(display.style.color).toBe('rgb(151, 160, 177)');
        expect(display.style.fontWeight).toBe('400');
        expect(display.style.marginLeft).toBe('6px');
        expect(display.style.textTransform).toBe('none');
        expect(historyTile.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();

        const tooltip = document.getElementById(submittedLabel.getAttribute('aria-describedby'));
        expect(tooltip).not.toBeNull();
        expect(tooltip.parentElement).toBe(document.body);
        expect(tooltip.getAttribute('role')).toBe('tooltip');
        expect(tooltip.textContent).toBe('Submitted to: robert.walker@wppmedia.com');
        expect(tooltip.hidden).toBe(true);
        expect(submittedLabel.getAttribute('tabindex')).toBe('0');

        submittedLabel.dispatchEvent(new window.MouseEvent('mouseenter'));
        expect(tooltip.hidden).toBe(false);
        submittedLabel.dispatchEvent(new window.MouseEvent('mouseleave'));
        expect(tooltip.hidden).toBe(true);
    });

    test('finds the active Submitted label when Prisma renders Workflow inside an open shadow root', async () => {
        setupDom([], true, false, {
            submittedRecipients: {
                CP123: {
                    emails: ['robert.walker@wppmedia.com'],
                    capturedAt: 123
                }
            }
        });
        const sidebar = document.querySelector('.approver-workflow-sidebar');
        sidebar.replaceChildren();
        const shadowRoot = sidebar.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = `
            <div class="workflow-sidebar-heading">WORKFLOW</div>
            <div class="workflow-sidebar-tabs"><span>Current</span><span>History</span></div>
            <mo-side-panel-tile class="mo-info active">
                <div class="mo-label label label-info">SUBMITTED</div>
            </mo-side-panel-tile>
        `;

        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const submittedLabel = shadowRoot.querySelector('.mo-label.label');
        const display = submittedLabel.nextElementSibling;
        expect(display.classList.contains('ops-toolshed-submitted-recipients')).toBe(true);
        expect(display.textContent).toBe('to: robert.walker@wppmedia.com');
        expect(shadowRoot.querySelectorAll('.ops-toolshed-submitted-recipients')).toHaveLength(1);
        expect(document.getElementById(submittedLabel.getAttribute('aria-describedby')))
            .toBeTruthy();
    });

    test('keeps the tooltip connected when Select2 temporarily hides its dropdown', async () => {
        setupDom();

        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();
        const removeButton = document.querySelector('.ops-toolshed-recipient-history-remove');
        const tooltipId = removeButton.getAttribute('aria-describedby');

        const toInput = document.querySelector('.select2-input');
        toInput.blur();
        window.approverPastingFeature.addRecipientHistoryControls();
        await flushPromises();

        expect(document.getElementById(tooltipId)).not.toBeNull();
        toInput.focus();
        expect(removeButton.getAttribute('aria-describedby')).toBe(tooltipId);
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

    test('does not read the clipboard after a synthetic page click', async () => {
        setupDom();
        const { pasteButton } = installAndCapturePasteHandler();

        pasteButton.click();
        await flushPromises();

        expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(pasteButton.disabled).toBe(false);
        expect(pasteButton.textContent).toBe('Paste Approvers');
    });

    test('keeps the full paste workflow working after a genuine user click', async () => {
        setupDom();
        document.execCommand = jest.fn().mockReturnValue(true);
        window.chrome.runtime.sendMessage.mockImplementation(async request => (
            request.action === 'getClipboardText'
                ? { status: 'success', text: 'first@example.com' }
                : { status: 'success' }
        ));
        const { pasteButton, pasteHandler } = installAndCapturePasteHandler();

        await pasteHandler.call(pasteButton, { isTrusted: true });

        expect(window.chrome.runtime.sendMessage.mock.calls.map(([request]) => request)).toEqual([
            { action: 'getClipboardText' },
            { action: 'copyToClipboard', text: 'first@example.com' },
            { action: 'copyToClipboard', text: 'first@example.com' }
        ]);
        expect(document.execCommand).toHaveBeenCalledWith('paste');
        expect(pasteButton.disabled).toBe(false);
        expect(pasteButton.textContent).toBe('Paste Approvers');
    });

    test('captures selected approval recipients before submit and shows them beside Submitted', async () => {
        setupDom();
        const choices = document.querySelector('.select2-choices');
        choices.insertAdjacentHTML('afterbegin', `
            <li class="select2-search-choice"><div>robert.walker@wppmedia.com</div><a class="select2-search-choice-close"></a></li>
            <li class="select2-search-choice"><div>jane.doe@example.com</div><a class="select2-search-choice-close"></a></li>
        `);
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Pending</span></div>
            <button type="button" class="submit-approval">Submit for approval</button>
        `);
        const status = workflowRoot.querySelector('.status-value');
        workflowRoot.querySelector('.submit-approval').addEventListener('click', () => {
            status.textContent = 'Submitted';
        });

        window.approverPastingFeature.handleSubmittedRecipientDisplay();
        await flushPromises();
        workflowRoot.querySelector('.submit-approval').click();
        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const sidebar = document.querySelector('.approver-workflow-sidebar');
        const sidebarStatus = sidebar.querySelector('.mo-label.label');
        const display = sidebar.querySelector('.ops-toolshed-submitted-recipients');
        expect(display.textContent).toBe('to: robert.walker@wppmedia.com, jane.doe@example.com');
        expect(display.getAttribute('aria-label'))
            .toBe('Submitted to robert.walker@wppmedia.com, jane.doe@example.com');
        expect(display.previousElementSibling).toBe(sidebarStatus);
        expect(workflowRoot.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();
        expect(storedSubmissionRecipients.CP123.emails)
            .toEqual(['robert.walker@wppmedia.com', 'jane.doe@example.com']);
    });

    test('promotes a pending recipient capture when an unlabeled Prisma workflow action submits the campaign', async () => {
        setupDom();
        const choices = document.querySelector('.select2-choices');
        choices.insertAdjacentHTML('afterbegin', `
            <li class="select2-search-choice"><div>robert.walker@wppmedia.com</div></li>
        `);
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        const sidebar = document.querySelector('.approver-workflow-sidebar');
        sidebar.querySelector('.mo-label.label').textContent = 'Pending';
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Pending</span></div>
            <button type="button" class="primary-action" aria-label="Continue">Continue</button>
        `);
        const status = workflowRoot.querySelector('.status-value');
        const trigger = workflowRoot.querySelector('.primary-action');
        trigger.addEventListener('click', () => {
            status.textContent = 'Submitted';
            sidebar.querySelector('.mo-label.label').textContent = 'Submitted';
            choices.querySelector('.select2-search-choice').remove();
        });

        await window.approverPastingFeature.handleSubmittedRecipientDisplay();
        await flushPromises();
        trigger.click();
        await flushPromises();
        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const display = sidebar.querySelector('.ops-toolshed-submitted-recipients');
        expect(display.textContent).toBe('to: robert.walker@wppmedia.com');
        expect(display.dataset.source).toBe('captured');
        expect(workflowRoot.querySelector('.ops-toolshed-submitted-recipients')).toBeNull();
        expect(storedSubmissionRecipients.CP123.emails)
            .toEqual(['robert.walker@wppmedia.com']);
    });

    test('restores the current campaign recipients from extension storage after the sidebar is rebuilt', async () => {
        setupDom([], true, false, {
            submittedRecipients: {
                CP123: {
                    emails: ['robert.walker@wppmedia.com'],
                    capturedAt: 123
                }
            }
        });
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Submitted</span></div>
        `);

        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const sidebar = document.querySelector('.approver-workflow-sidebar');
        const display = sidebar.querySelector('.ops-toolshed-submitted-recipients');
        expect(display.textContent).toBe('to: robert.walker@wppmedia.com');
        expect(display.dataset.source).toBe('captured');
    });

    test('uses selected To recipients when an existing Submitted campaign has no stored capture', async () => {
        setupDom();
        document.querySelector('.select2-choices').insertAdjacentHTML('afterbegin', `
            <li class="select2-search-choice"><div>robert.walker@wppmedia.com</div></li>
        `);
        const workflowRoot = document.querySelector('.workflow-widget-wrapper');
        workflowRoot.insertAdjacentHTML('beforeend', `
            <div class="approval-status"><span class="status-value">Submitted</span></div>
        `);

        await window.approverPastingFeature.handleSubmittedRecipientDisplay();

        const sidebar = document.querySelector('.approver-workflow-sidebar');
        const display = sidebar.querySelector('.ops-toolshed-submitted-recipients');
        expect(display.textContent).toBe('to: robert.walker@wppmedia.com');
        expect(display.dataset.source).toBe('current');
    });
});
