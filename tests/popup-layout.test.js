const fs = require('fs');
const path = require('path');

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
const popupCss = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8');

function getFlexGrow(selector) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = popupCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
    const flex = block?.[1].match(/flex:\s*([\d.]+)/);
    return Number(flex?.[1]);
}

describe('Popup bottom menu layout', () => {
    test('gives the combined Release Notes, Roadmap & Stats action enough space', () => {
        expect(popupHtml).toContain('Release Notes, Roadmap &amp; Stats');

        const settingsFlex = getFlexGrow('#menu-settings');
        const roadmapFlex = getFlexGrow('#menu-roadmap');

        expect(settingsFlex / (settingsFlex + roadmapFlex)).toBeCloseTo(0.3);
    });
});
