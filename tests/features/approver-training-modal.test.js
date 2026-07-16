const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../../approvers.html'), 'utf8');
const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/approver-training-modal.js'),
    'utf8'
);

function createModal() {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'chrome-extension://test/approvers.html'
    });
    Object.defineProperty(dom.window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn().mockResolvedValue(undefined) }
    });
    dom.window.chrome = { runtime: { sendMessage: jest.fn().mockResolvedValue({ status: 'success' }) } };
    dom.window.eval(featureCode);
    return dom;
}

describe('Approver training guidance modal', () => {
    test('opens from the header prompt with the requested guidance', () => {
        const dom = createModal();
        const { document } = dom.window;

        document.getElementById('need-more-approvers').click();
        expect(document.getElementById('approver-training-root').hidden).toBe(false);
        expect(document.getElementById('approver-training-title').textContent).toBe('Need more approvers?');
        expect(document.querySelector('.approver-training-copy').textContent)
            .toContain("whoever sends the plans shouldn't also be approving them");
        dom.window.close();
    });

    test('copies the exact training URL and shows confirmation', async () => {
        const dom = createModal();
        const { document, navigator } = dom.window;

        document.getElementById('need-more-approvers').click();
        await dom.window.approverTrainingModalFeature.copy();

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            'https://wpponlinetraining.com/course/view.php?id=115'
        );
        expect(document.getElementById('approver-training-toast').classList.contains('visible')).toBe(true);
        expect(document.querySelector('#copy-approver-training span').textContent).toBe('Copied');
        dom.window.close();
    });

    test('uses the shared feedback-modal animation classes when closing', () => {
        const dom = createModal();
        const { document } = dom.window;
        document.getElementById('need-more-approvers').click();
        document.getElementById('close-approver-training').click();

        expect(document.getElementById('approver-training-root').classList.contains('otf-closing')).toBe(true);
        dom.window.close();
    });
});
