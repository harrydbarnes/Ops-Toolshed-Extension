(function() {
    'use strict';

    const utils = {
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

        normalizeTriggers(triggers) {
            if (typeof triggers === 'string') {
                return triggers.split(',').map(t => t.trim()).filter(Boolean);
            } else if (Array.isArray(triggers)) {
                return triggers.filter(Boolean);
            }
            return [];
        },

        queryShadowDom(selector, root = document) {
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

        waitForElementInShadow(selector, root = document, timeout = 10000) {
            return new Promise((resolve, reject) => {
                const intervalTime = 200;
                let elapsedTime = 0;
                const interval = setInterval(() => {
                    const element = this.queryShadowDom(selector, root);
                    if (element) {
                        clearInterval(interval);
                        resolve(element);
                    } else {
                        elapsedTime += intervalTime;
                        if (elapsedTime >= timeout) {
                            clearInterval(interval);
                            reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms.`));
                        }
                    }
                }, intervalTime);
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
                    }
                    #${toastId}.show { opacity: 1; }
                    #${toastId}.toast-info { background-color: #0288D1; }
                    #${toastId}.toast-success { background-color: #388E3C; }
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