const fs = require('fs');
const path = require('path');
const { FEATURE_CATALOGUE, BOOLEAN_DEFAULTS } = require('../feature-settings-registry.js');

const destination = path.resolve(__dirname, '../docs/feature-catalogue.md');
const groups = {
    personalise: 'Personalise and reminders',
    navigate: 'Navigation',
    create: 'Campaign creation and details',
    orders: 'Orders and Actualise',
    help: 'Help and live chat'
};
const escapeCell = value => String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const lines = [
    '# Feature catalogue',
    '',
    'Generated from `feature-settings-registry.js`. Edit that registry, then run `npm run docs:features`. Settings and the in-extension feature explorer use the same records. The in-extension release notes in `toolshed.html` remain the owner of version history.',
    '',
    'The non-Prisma setup profile does not inject Prisma features. Shared popup tools, Settings, Approvers and timesheet reminders remain available.',
    ''
];
for (const [group, title] of Object.entries(groups)) {
    const features = FEATURE_CATALOGUE.filter(item => item.group === group);
    if (!features.length) continue;
    lines.push(`## ${title}`, '', '| Feature | What it does | Default |', '| --- | --- | --- |');
    for (const feature of features) {
        const defaultValue = feature.setting && Object.hasOwn(BOOLEAN_DEFAULTS, feature.setting)
            ? (BOOLEAN_DEFAULTS[feature.setting] ? 'On' : 'Off')
            : 'Choice or action';
        lines.push(`| ${escapeCell(feature.title)} | ${escapeCell(feature.description)} | ${defaultValue} |`);
    }
    lines.push('');
}
const output = lines.join('\n');
if (process.argv.includes('--check')) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output) {
        console.error('Feature catalogue is out of date. Run npm run docs:features.');
        process.exitCode = 1;
    }
} else {
    fs.writeFileSync(destination, output);
    console.log(`Updated ${destination}`);
}
