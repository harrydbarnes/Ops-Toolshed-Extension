const fs = require('fs');
const path = require('path');

const feedbackStyles = fs.readFileSync(
    path.resolve(__dirname, '../../features/feedback-modal.css'),
    'utf8'
);

describe('feedback modal shared appearance', () => {
    test('owns its modal sizing and select appearance across host pages', () => {
        expect(feedbackStyles).toMatch(/\.otf-modal\s*\{[^}]*box-sizing:\s*border-box/s);
        expect(feedbackStyles).toMatch(/\.otf-select\s*\{[^}]*appearance:\s*none/s);
        expect(feedbackStyles).toMatch(/\.otf-select\s*\{[^}]*background-image:\s*url/s);
    });
});
