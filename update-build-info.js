const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildInfoPath = path.join(__dirname, 'build-info.js'); // Adjust path if script is in a subfolder

try {
    // Get current date
    const buildDate = new Date().toISOString().replace('T', ' ').substring(0, 19);

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
    buildDate: "${new Date().toISOString()}",
    commitId: "unknown"
};`;
    fs.writeFileSync(buildInfoPath, content);
}
