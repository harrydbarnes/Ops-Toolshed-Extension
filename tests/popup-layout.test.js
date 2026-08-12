const fs = require('fs');
const path = require('path');

const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
const popupCss = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8');
const approversHtml = fs.readFileSync(path.resolve(__dirname, '../approvers.html'), 'utf8');
const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');

function getFlexGrow(selector) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = popupCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
    const flex = block?.[1].match(/flex:\s*([\d.]+)/);
    return Number(flex?.[1]);
}

describe('Popup bottom menu layout', () => {
    test('loads its startup styles and icons without network requests', () => {
        expect(popupHtml).not.toMatch(/<link[^>]+href=["']https?:\/\//i);
        expect(popupCss).not.toMatch(/@import\s+url\(["']?https?:\/\//i);
        expect(popupHtml).not.toContain('font-awesome');
        expect(popupHtml).toContain('<body class="popup-page">');
        expect(popupHtml.match(/<svg\b/g)).toHaveLength(2);
        expect(popupHtml.match(/assets\/icons\/fontawesome\/(?:gear|file-lines|bullhorn)-solid\.svg/g)).toHaveLength(3);
    });

    test('scopes replacement icon styles to the popup', () => {
        expect(popupCss).toMatch(/\.popup-page img\.menu-icon\s*\{/);
        expect(popupCss).toMatch(/\.popup-page #menu-feedback img\.menu-icon\s*\{[^}]*width:\s*13px;[^}]*height:\s*13px;/s);
        expect(popupCss).toMatch(/\.popup-page svg\.menu-chevron\s*\{/);
        expect(approversHtml).toContain('family=Montserrat');
        expect(settingsHtml).toContain('family=Montserrat');
    });

    test('gives the combined Release Notes, Roadmap & Stats action enough space', () => {
        expect(popupHtml).toContain('Release Notes, Roadmap &amp; Stats');

        const settingsFlex = getFlexGrow('#menu-settings');
        const roadmapFlex = getFlexGrow('#menu-roadmap');

        expect(settingsFlex / (settingsFlex + roadmapFlex)).toBeCloseTo(0.3);
    });
});
