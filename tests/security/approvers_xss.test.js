/**
 * @jest-environment jsdom
 */

import { renderApprovers } from '../../approvers.js';

describe('Approvers Security (XSS)', () => {
    let approversList;
    let approversCount;
    let selectedApprovers;
    let favoriteApprovers;
    let document;

    beforeEach(() => {
        // Setup JSDOM elements
        document = window.document;
        approversList = document.createElement('div');
        approversList.id = 'approvers-list';
        approversCount = document.createElement('div');
        approversCount.id = 'approvers-count';

        selectedApprovers = new Set();
        favoriteApprovers = new Set();
    });

    test('should prevent XSS in approver name', () => {
        const maliciousPayload = '<img src=x onerror=alert(1)>';
        const approvers = [{
            id: 'malicious',
            firstName: 'Malicious',
            lastName: maliciousPayload,
            email: 'mal@test.com',
            officeName: 'Office',
            businessUnit: 'Unit',
            specialty: 'Specialty'
        }];

        renderApprovers(approvers, {
            approversList,
            approversCount,
            selectedApprovers,
            favoriteApprovers,
            document
        });

        // Verify HTML does not contain the unescaped payload
        // Note: browsers might normalize attributes, so we check for the tag presence mostly
        expect(approversList.innerHTML).not.toContain('<img src=x onerror=alert(1)>');

        // Verify the text content contains the payload (as text)
        const h4 = approversList.querySelector('h4');
        expect(h4.textContent).toContain(maliciousPayload);

        // Verify no img tag was created
        expect(approversList.querySelector('img')).toBeNull();
    });

    test('should prevent XSS in other fields', () => {
        const maliciousPayload = '<script>alert(1)</script>';
        const approvers = [{
            id: 'malicious2',
            firstName: 'Test',
            lastName: 'User',
            email: maliciousPayload,
            officeName: maliciousPayload,
            businessUnit: maliciousPayload,
            specialty: maliciousPayload
        }];

        renderApprovers(approvers, {
            approversList,
            approversCount,
            selectedApprovers,
            favoriteApprovers,
            document
        });

        expect(approversList.innerHTML).not.toContain('<script>');
        expect(approversList.querySelector('script')).toBeNull();

        const p = approversList.querySelector('p'); // email
        expect(p.textContent).toBe(maliciousPayload);

        const tags = approversList.querySelectorAll('.tag');
        tags.forEach(tag => {
            expect(tag.textContent).toBe(maliciousPayload);
        });
    });
});
