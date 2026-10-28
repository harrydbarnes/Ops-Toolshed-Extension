(function() {
    'use strict';

    const utils = {
        builtInReminders: Object.freeze({
            meta: Object.freeze({
                title: '⚠️ Meta Reconciliation Reminder ⚠️',
                message: 'When reconciling Meta, please:',
                list: Object.freeze(["Actualise to the 'Supplier' option", 'Self-accept the IO', 'Push through on trafficking tab to Meta', 'Verify success of the push, every time', 'Do not just leave the page!'])
            }),
            ias: Object.freeze({
                title: '⚠️ IAS Booking Reminder ⚠️',
                message: 'Please ensure you book as CPM',
                list: Object.freeze(['With correct rate for media type', 'Check the plan', 'Ensure what is planned is what goes live'])
            })
        }),
        clickElement(element) {
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const view = element.ownerDocument?.defaultView || window;
            const clientX = rect.left + Math.min(Math.max(rect.width / 2, 8), rect.width - 1);
            const clientY = rect.top + Math.min(Math.max(rect.height / 2, 8), rect.height - 1);
            const options = { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0, view };
            const pointerOptions = { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true };
            if (view.PointerEvent) element.dispatchEvent(new view.PointerEvent('pointerdown', { ...pointerOptions, buttons: 1 }));
            element.dispatchEvent(new view.MouseEvent('mousedown', { ...options, buttons: 1 }));
            if (view.PointerEvent) element.dispatchEvent(new view.PointerEvent('pointerup', { ...pointerOptions, buttons: 0 }));
            element.dispatchEvent(new view.MouseEvent('mouseup', { ...options, buttons: 0 }));
            element.dispatchEvent(new view.MouseEvent('click', { ...options, buttons: 0 }));
        },

        waitForResult(find, { timeout = 10000, intervalMs = 100, timeoutMessage = 'Element not found' } = {}) {
            return new Promise((resolve, reject) => {
                const finish = (settle, value) => {
                    clearInterval(interval);
                    clearTimeout(timer);
                    settle(value);
                };
                const interval = setInterval(() => {
                    try {
                        const result = find();
                        if (result) finish(resolve, result);
                    } catch (error) {
                        finish(reject, error);
                    }
                }, intervalMs);
                const timer = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeout);
            });
        },


        escapeHTML(str) {
            if (str === null || str === undefined) return '';
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        },

        escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        sanitizeReminderHTML(htmlString) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString || '', 'text/html');
            const allowedTags = new Set(['h3', 'p', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li']);

            const processNode = (node) => {
                if (node.nodeType === 3) { // Text Node
                    return window.utils.escapeHTML(node.textContent);
                }

                if (node.nodeType !== 1) { // Not an Element
                    return '';
                }

                const tagName = node.tagName.toLowerCase();
                if (!allowedTags.has(tagName)) {
                    // Discard unallowed tags but process their children
                    return processNodes(node.childNodes);
                }

                // Special handling for lists to ensure they only contain list items
                if (tagName === 'ul' || tagName === 'ol') {
                    const children = Array.from(node.children)
                        .filter(child => child.tagName.toLowerCase() === 'li')
                        .map(processNode)
                        .join('');
                    return `<${tagName}>${children}</${tagName}>`;
                }

                const children = processNodes(node.childNodes);
                return `<${tagName}>${children}</${tagName}>`;
            };

            const processNodes = (nodes) => {
                return Array.from(nodes).map(processNode).join('');
            };

            return processNodes(doc.body.childNodes);
        },

        buildReminderPopupHTML(reminder) {
            const safeContent = utils.sanitizeReminderHTML(reminder?.popupMessage || '');
            if (/<h3(?:\s|>)/i.test(safeContent)) return safeContent;
            return `<h3>${utils.escapeHTML(reminder?.name || 'Reminder')}</h3>${safeContent}`;
        },

        normalizeTriggers(triggers) {
            if (typeof triggers === 'string') {
                return triggers.split(',').map(t => t.trim()).filter(Boolean);
            } else if (Array.isArray(triggers)) {
                return triggers.filter(Boolean);
            }
            return [];
        },

        queryShadowDom(selector, root = document) {
            if (!root?.querySelector || !root?.querySelectorAll) return null;
            const found = root.querySelector(selector);
            if (found) return found;

            const allElements = root.querySelectorAll('*');
            for (const element of allElements) {
                if (element.shadowRoot) {
                    const foundInShadow = this.queryShadowDom(selector, element.shadowRoot);
                    if (foundInShadow) return foundInShadow;
                }
            }
            return null;
        },

        queryAllShadowDom(selector, root = document) {
            if (!root?.querySelector || !root?.querySelectorAll) return [];
            const matches = new Set(root.querySelectorAll(selector));
            root.querySelectorAll('*').forEach(element => {
                if (!element.shadowRoot) return;
                this.queryAllShadowDom(selector, element.shadowRoot).forEach(match => matches.add(match));
            });
            return Array.from(matches);
        },

        isElementVisible(element) {
            if (!element?.isConnected) return false;

            let current = element;
            while (current) {
                const style = window.getComputedStyle(current);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return false;
                }
                const root = current.getRootNode?.();
                current = current.parentElement || root?.host || null;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },

        findVisibleLoadingSpinners(root = document) {
            const selector = [
                '#vp-block > i.fa.fa-circle-o-notch.fa-spin',
                'mo-spinner',
                '.mo-spinner',
                'svg.spinner'
            ].join(', ');
            return this.queryAllShadowDom(selector, root).filter(element => this.isElementVisible(element));
        },

        waitForElement(selector, timeout = 2000) {
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    const element = document.querySelector(selector);
                    if (element) {
                        clearInterval(interval);
                        clearTimeout(timer);
                        resolve(element);
                    }
                }, 100);
                const timer = setTimeout(() => {
                    clearInterval(interval);
                    reject(new Error(`Element '${selector}' not found within ${timeout}ms`));
                }, timeout);
            });
        },

        waitForElementToDisappear(selector, timeout = 2000) {
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    const element = document.querySelector(selector);
                    if (!element) {
                        clearInterval(interval);
                        clearTimeout(timer);
                        resolve();
                    }
                }, 100);
                const timer = setTimeout(() => {
                    clearInterval(interval);
                    reject(new Error(`Element '${selector}' did not disappear within ${timeout}ms`));
                }, timeout);
            });
        },

        waitForElementInShadow(selector, timeout = 10000, root = document) {
            return this.waitForResult(() => this.queryShadowDom(selector, root), {
                timeout,
                intervalMs: 200,
                timeoutMessage: `Element with selector "${selector}" not found within ${timeout}ms.`
            });
        },

        showToast(message, type = 'info') {
            const toastId = 'ops-toolshed-toast';
            let toast = document.getElementById(toastId);

            const styleId = 'ops-toolshed-toast-styles';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    #${toastId} {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        padding: 15px;
                        border-radius: 8px;
                        z-index: 2147483647;
                        font-family: sans-serif;
                        font-size: 16px;
                        box-shadow: 0 4px 10px rgba(0,0,0,0.25);
                        opacity: 0;
                        transition: opacity 0.3s ease-in-out;
                        color: white;
                        pointer-events: none;
                    }
                    #${toastId}.show { opacity: 1; }
                    #${toastId}.toast-offset-native { top: 44px; }
                    #${toastId}.toast-info { background-color: #0288D1; }
                    #${toastId}.toast-success { background-color: #333668; }
                    #${toastId}.toast-error { background-color: #D32F2F; }
                `;
                document.head.appendChild(style);
            }

            if (!toast) {
                toast = document.createElement('div');
                toast.id = toastId;
                document.body.appendChild(toast);
            }

            toast.textContent = message;
            toast.className = `toast-${type}`; // Remove previous classes

            // Animate in
            setTimeout(() => {
                toast.classList.add('show');
            }, 10);

            // Animate out and remove after a delay
            setTimeout(() => {
                toast.classList.remove('show');
            }, 4000); // 4 seconds
        }
    };

    window.utils = utils;
})();
