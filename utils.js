(function() {
    'use strict';

    const utils = {
        escapeHTML(str) {
            if (str === null || str === undefined) return '';
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
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
        }
    };

    window.utils = utils;
})();