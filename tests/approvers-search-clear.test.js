/**
 * @jest-environment jsdom
 */

import { clearApproverSearch, syncSearchClearButton } from '../approvers.js';

describe('Approver search clear action', () => {
    test('shows the clear action only while the search field contains text', () => {
        const input = document.createElement('input');
        const button = document.createElement('button');
        button.hidden = true;

        input.value = 'Jane';
        syncSearchClearButton(input, button);
        expect(button.hidden).toBe(false);

        input.value = '';
        syncSearchClearButton(input, button);
        expect(button.hidden).toBe(true);
    });

    test('clears, refreshes and returns focus to the search field', () => {
        const input = document.createElement('input');
        const button = document.createElement('button');
        const filterApprovers = jest.fn();
        document.body.append(input, button);
        input.value = 'Jane';
        button.hidden = false;

        clearApproverSearch({ searchInput: input, clearButton: button, filterApprovers });

        expect(input.value).toBe('');
        expect(button.hidden).toBe(true);
        expect(filterApprovers).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(input);
    });
});
