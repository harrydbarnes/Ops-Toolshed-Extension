const fs = require('fs');
const path = require('path');

function getFormattedDate() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');

    const date = [p(d.getDate()), p(d.getMonth() + 1), d.getFullYear()].join('.');
    const time = [p(d.getHours()), p(d.getMinutes()), p(d.getSeconds())].join(':');

    return `${date} (${time})`;
}

function findPackedRef(packedRefs, ref) {
    const entry = packedRefs.split(/\r?\n/).find(line => line.endsWith(` ${ref}`));
    return entry ? entry.split(' ')[0] : null;
}

function getCommitId(repoRoot = __dirname) {
    const gitPath = path.join(repoRoot, '.git');
    const gitDirectory = fs.statSync(gitPath).isDirectory()
        ? gitPath
        : path.resolve(repoRoot, fs.readFileSync(gitPath, 'utf8').trim().slice('gitdir: '.length));
    const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? head.slice('ref: '.length) : null;
    let commitId = head;

    if (ref) {
        try {
            commitId = fs.readFileSync(path.join(gitDirectory, ref), 'utf8').trim();
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const packedRefs = fs.readFileSync(path.join(gitDirectory, 'packed-refs'), 'utf8');
            commitId = findPackedRef(packedRefs, ref);
            if (!commitId) throw new Error(`Git reference not found: ${ref}`);
        }
    }

    return commitId.slice(0, 7);
}

function updateBuildInfo() {
    const buildInfoPath = path.join(__dirname, 'build-info.js');
    const buildDate = getFormattedDate();

    try {
        const commitId = getCommitId();

        const content = `window.buildInfo = {
    buildDate: "${buildDate}",
    commitId: "${commitId}"
};
`;

        fs.writeFileSync(buildInfoPath, content);
        console.log(`[Build Info] Updated build-info.js with Date: ${buildDate}, Commit: ${commitId}`);

    } catch (error) {
        console.error('[Build Info] Error updating build info:', error);
        const content = `window.buildInfo = {
    buildDate: "${buildDate}",
    commitId: "unknown"
};`;
        fs.writeFileSync(buildInfoPath, content);
    }
}

if (require.main === module) {
    updateBuildInfo();
}

module.exports = { findPackedRef, getCommitId, updateBuildInfo };
