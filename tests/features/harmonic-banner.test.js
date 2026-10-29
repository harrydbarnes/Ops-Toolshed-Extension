const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('../helpers/read-script');
const script = readScript(path.resolve(__dirname, '../../features/harmonic-banner.js'));
const manifest = require('../../manifest.json');
const markup = '<div class="hs-banner" data-harmonic-security-root="true"><div class="advise-banner"><div class="action"><button data-testid="dismiss">Okay</button></div></div></div><div class="hs-banner" data-harmonic-security-root="true"><div class="block-modal"></div></div>';
function setup(timestamp) {
    const dom = new JSDOM(markup, { runScripts: 'dangerously' });
    dom.window.chrome = { runtime: {}, storage: { local: { get: (_defaults, cb) => cb({ harmonicAdviceAcknowledgedAt: timestamp }), set: jest.fn() } } };
    dom.window.eval(script);
    return dom;
}
test('runs only on the requested sites', () => {
    const registration = manifest.content_scripts.find(item => item.js?.includes('features/harmonic-banner.js'));
    expect(registration.matches).toEqual(['https://chatgpt.com/*', 'https://x.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*']);
});
test.each([0, Date.now() - 8 * 86400000, Date.now() + 86400000])('shows acknowledgement for missing, expired or future timestamps', timestamp => {
    const dom = setup(timestamp);
    expect(dom.window.document.querySelector('[data-ops-harmonic-ack] input').checked).toBe(false);
    expect(dom.window.document.querySelector('.hs-banner').style.display).toBe('block');
    dom.window.document.querySelector('[data-testid="dismiss"]').click();
    expect(dom.window.chrome.storage.local.set).not.toHaveBeenCalled();
    dom.window.close();
});
test('hides recently acknowledged advice, including later banners, without hiding other interventions', async () => {
    const dom = setup(Date.now());
    const [banner, other] = dom.window.document.querySelectorAll('.hs-banner');
    expect(banner.style.getPropertyPriority('display')).toBe('important');
    expect(other.style.display).toBe('');
    const added = banner.cloneNode(true);
    added.style.display = '';
    dom.window.document.body.appendChild(added);
    await Promise.resolve();
    expect(added.style.getPropertyPriority('display')).toBe('important');
    dom.window.close();
});

test('enables the acknowledgement after the three-second countdown', async () => {
    const dom = setup(0);
    const label = dom.window.document.querySelector('[data-ops-harmonic-ack]');
    const checkbox = label.querySelector('input');
    expect(checkbox.disabled).toBe(true);
    expect(label.textContent).toContain('(3s)');
    await new Promise(resolve => setTimeout(resolve, 2100));
    expect(checkbox.disabled).toBe(true);
    expect(label.textContent).toContain('(1s)');
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(checkbox.disabled).toBe(false);
    expect(label.textContent).not.toMatch(/\(\d+s\)/);
    dom.window.close();
});
