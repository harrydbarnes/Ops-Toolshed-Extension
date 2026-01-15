const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildInfoPath = path.join(__dirname, 'build-info.js'); // Adjust path if script is in a subfolder

function getFormattedDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${day}.${month}.${year} (${hours}:${minutes}:${seconds})`;
}

try {
    // Get current date
    const buildDate = getFormattedDate();

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
    buildDate: "${getFormattedDate()}",
    commitId: "unknown"
};`;
    fs.writeFileSync(buildInfoPath, content);
}
