const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildInfoPath = path.join(__dirname, 'build-info.js'); // Adjust path if script is in a subfolder

function getFormattedDate() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');

    const date = [p(d.getDate()), p(d.getMonth() + 1), d.getFullYear()].join('.');
    const time = [p(d.getHours()), p(d.getMinutes()), p(d.getSeconds())].join(':');

    return `${date} (${time})`;
}

// Get current date once, to be used in both success and error cases
const buildDate = getFormattedDate();

try {
    // Get latest commit hash (short version)
    const commitId = execSync('git rev-parse --short HEAD').toString().trim();

    const content = `window.buildInfo = {
    buildDate: "${buildDate}",
    commitId: "${commitId}"
};
`;

    fs.writeFileSync(buildInfoPath, content);
    console.log(`[Build Info] Updated build-info.js with Date: ${buildDate}, Commit: ${commitId}`);

} catch (error) {
    console.error('[Build Info] Error updating build info:', error);
    // Fallback to avoid breaking the build if git fails
    const content = `window.buildInfo = {
    buildDate: "${buildDate}",
    commitId: "unknown"
};`;
    fs.writeFileSync(buildInfoPath, content);
}
