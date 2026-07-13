const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const contentStyles = fs.readFileSync(
    path.resolve(__dirname, '../content.css'),
    'utf8'
);

function getWorkflowSlotStyles(bodyClass = '') {
    const dom = new JSDOM(`<!doctype html>
        <html>
            <head>
                <style>
                    .p2b-navbar-wrapper { display: flex; justify-content: space-between; }
                    .ai-style-change-1 { display: flex; }
                    ${contentStyles}
                </style>
            </head>
            <body class="${bodyClass}">
                <div class="p2b-navbar-wrapper">
                    <div id="p2b-navbar">Campaign navigation</div>
                    <div class="ai-style-change-1">
                        <div class="workflow-widget-wrapper">Workflow</div>
                    </div>
                </div>
            </body>
        </html>`);

    const slot = dom.window.document.querySelector('.ai-style-change-1');
    const styles = dom.window.getComputedStyle(slot);
    const result = {
        flexGrow: styles.flexGrow,
        alignItems: styles.alignItems,
        justifyContent: styles.justifyContent
    };
    dom.window.close();
    return result;
}

describe('workflow widget alignment', () => {
    test.each([
        { bodyClass: '', state: 'features are disabled' },
        {
            bodyClass: 'approver-widget-optimise gmi-chat-enabled',
            state: 'features are enabled'
        }
    ])('centres the workflow wrapper when $state', ({ bodyClass }) => {
        expect(getWorkflowSlotStyles(bodyClass)).toEqual({
            flexGrow: '1',
            alignItems: 'center',
            justifyContent: 'center'
        });
    });

    test('centres the workflow slot against the full page on wide screens', () => {
        const dom = new JSDOM(`<!doctype html><style>${contentStyles}</style>`);
        const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
        const wideScreenRule = rules.find(rule =>
            rule.conditionText === '(min-width: 1440px)'
        );
        const slotRule = Array.from(wideScreenRule.cssRules).find(rule =>
            rule.selectorText === '.p2b-navbar-wrapper > .ai-style-change-1'
        );

        expect({
            position: slotRule.style.position,
            left: slotRule.style.left,
            top: slotRule.style.top,
            width: slotRule.style.width,
            transform: slotRule.style.transform
        }).toEqual({
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 'max-content',
            transform: 'translate(-50%, -50%)'
        });
        dom.window.close();
    });

    test('keeps the Prisma page header above native modal layers', () => {
        const dom = new JSDOM(`<!doctype html>
            <html>
                <head><style>${contentStyles}</style></head>
                <body><div id="ptb-header">Campaign header</div></body>
            </html>`);
        const styles = dom.window.getComputedStyle(
            dom.window.document.getElementById('ptb-header')
        );

        expect(styles.position).toBe('relative');
        expect(styles.zIndex).toBe('10001');
        expect(styles.overflow).toBe('visible');
        dom.window.close();
    });
});
