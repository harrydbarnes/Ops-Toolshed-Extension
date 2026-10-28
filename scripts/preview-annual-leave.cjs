// Local-only visual QA. This serves the real UI with an explicitly labelled, in-memory Chrome mock.
// Run: node scripts/preview-annual-leave.cjs, then open http://127.0.0.1:8766/annual-leave.html.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mock = `const previewStore={annualLeaveSettings:{name:'Preview User',organizer:'user@preview.invalid',recipients:'team@preview.invalid'},annualLeaveDraft:{id:'preview-example',name:'Preview User',dates:['2026-12-21','2026-12-22','2026-12-24'],submitted:true}};
window.chrome={storage:{local:{get:async()=>previewStore,set:async value=>Object.assign(previewStore,value),remove:async key=>delete previewStore[key]},sync:{get:async()=>({allFeaturesDisabled:false})}},permissions:{contains:async()=>false,request:async()=>false}};`;
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:8766');
    if (url.pathname === '/preview-chrome.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(mock); return; }
    const relative = url.pathname.slice(1);
    if (!['annual-leave.html', 'annual-leave.css', 'annual-leave.js', 'annual-leave-calendar.js', 'assets/fonts/fonts.css'].includes(relative) && !/^assets\/fonts\/[a-z0-9-]+\.woff2$/.test(relative)) { res.writeHead(404); res.end(); return; }
    try {
        let contents = fs.readFileSync(path.join(root, relative));
        if (relative === 'annual-leave.html') contents = contents.toString().replace('<script src="annual-leave-calendar.js"', '<script src="preview-chrome.js"></script><script src="annual-leave-calendar.js"').replace('<main>', '<main><p style="color:#a11652;font-weight:600">Local preview · illustrative dates · no calendar or Workday connection</p>');
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
        res.setHeader('Content-Type', types[path.extname(relative)] || 'application/octet-stream'); res.end(contents);
    } catch { res.writeHead(404); res.end(); }
}).listen(8766, '127.0.0.1', () => console.log('Annual Leave preview: http://127.0.0.1:8766/annual-leave.html'));
