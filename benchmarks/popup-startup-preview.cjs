// Local-only investigation harness. Does not read actual extension storage.
// Run: node benchmarks/popup-startup-preview.cjs
// Browse /popup.html?apiDelay=3000&rows=0 or ?apiDelay=0&rows=20000.
const http = require('http');
const fs = require('fs');
const path = require('path');
const resultToken = require('crypto').randomBytes(32).toString('hex');
const root = path.resolve(__dirname, '..');
const allowed = new Set([
    'popup.html', 'popup.js', 'feature-settings-registry.js',
    'style.css', 'icon.png', 'assets/icons/fontawesome/gear-solid.svg',
    'assets/icons/fontawesome/file-lines-solid.svg', 'assets/icons/fontawesome/bullhorn-solid.svg'
]);

function probe(apiDelay, rows) {
    return `(() => {
        const events = [], tasks = [];
        performance.mark('popup-probe-start');
        new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => ({start:e.startTime,duration:e.duration}))))
            .observe({type:'longtask',buffered:true});
        document.addEventListener('DOMContentLoaded', () => performance.mark('popup-dom-ready'));
        window.addEventListener('load', () => performance.mark('popup-window-loaded'));
        const tracker = ${rows} ? {month:'2026-10', rows:Array.from({length:${rows}},(_,i)=>({
            sourceRow:i+2,ops:i%2?'Other':'Test person',buyer:'Buyer',group:'Group',
            reccied:i%3?'No':'Yes',campaignId:'CPTEST',campaignName:'Synthetic campaign',dNumber:'D12345678'
        })),checks:{},lastCheckTiming:{campaignsDetail:[]}} : null;
        const stored = JSON.stringify({reccieTracker:tracker,recciePreferences:{person:'Test person',assignment:'ops'}});
        function later(name, value, callback) {
            const event={name,start:performance.now()}; events.push(event);
            return new Promise(resolve=>setTimeout(()=>{
                const result=typeof value==='function'?value():value;
                event.callbackStart=performance.now(); callback?.(result); resolve(result);
                queueMicrotask(()=>event.end=performance.now());
            },${apiDelay}));
        }
        window.chrome={
            runtime:{getManifest:()=>({version:'1.9'}),getURL:file=>new URL(file,location.href).href,
                openOptionsPage:()=>events.push({name:'open-options',start:performance.now()}),
                sendMessage:()=>Promise.resolve({status:'success'})},
            storage:{sync:{get:(keys,cb)=>later('sync-get',Array.isArray(keys)?{}:keys,cb),remove:()=>Promise.resolve()},
                local:{get:()=>later('local-get',()=>JSON.parse(stored))},onChanged:{addListener(){}}},
            tabs:{query:()=>later('tabs-query',[{id:1,windowId:1}]),
                create:()=>events.push({name:'create-tab',start:performance.now()})}
        };
        window.popupProbe=()=>({
            apiDelay:${apiDelay},rows:${rows},syntheticStorageBytes:stored.length,
            marks:performance.getEntriesByType('mark').map(e=>({name:e.name,ms:e.startTime})),
            paints:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime})),
            requests:events,longTasks:tasks,
            resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize})),
            title:document.querySelector('h1')?.textContent,
            status:document.getElementById('recciesPopupStatus')?.textContent
        });
        window.savePopupProbe=()=>fetch('/results',{method:'POST',headers:{'Content-Type':'application/json','X-Probe-Token':${JSON.stringify(resultToken)}},body:JSON.stringify(window.popupProbe())});
    })();`;
}

http.createServer((req, res) => {
    if (req.headers.host !== '127.0.0.1:8766') { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:8766');
    if (url.pathname === '/probe.js') {
        const delay = Math.min(10000, Math.max(0, Number(url.searchParams.get('apiDelay')) || 0));
        const rows = Math.min(30000, Math.max(0, Number(url.searchParams.get('rows')) || 0));
        res.writeHead(200, {'Content-Type':'text/javascript','Cache-Control':'no-store'});
        res.end(probe(delay, rows)); return;
    }
    if (req.method === 'POST' && url.pathname === '/results') {
        if (req.headers.origin !== 'http://127.0.0.1:8766' || req.headers['x-probe-token'] !== resultToken) { res.writeHead(403); res.end(); return; }
        let body = '';
        let bytes = 0, rejected = false;
        req.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) { if (!rejected) { rejected = true; res.writeHead(413); res.end(); } return; } if (!rejected) body += chunk; });
        req.on('end', () => {
            if (rejected) return;
            let evidence;
            try { evidence = JSON.parse(body); if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || !Array.isArray(evidence.marks) || !Array.isArray(evidence.requests)) throw Error('Invalid probe'); }
            catch (_) { res.writeHead(400); res.end('Invalid probe'); return; }
            fs.writeFileSync(path.join(root,'docs/popup-startup-measurement-2026-10-22.json'), JSON.stringify(evidence,null,2)+'\n');
            res.writeHead(200); res.end('saved');
        }); return;
    }
    const file = url.pathname.slice(1);
    if (!allowed.has(file)) { res.writeHead(404); res.end(); return; }
    let content = fs.readFileSync(path.join(root, file));
    if (file === 'popup.html') {
        const params = new URLSearchParams({apiDelay:url.searchParams.get('apiDelay')||'0',rows:url.searchParams.get('rows')||'0'});
        content = content.toString().replace('<head>', `<head><script src="probe.js?${params}"></script>`);
    }
    const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];
    res.writeHead(200, {'Content-Type':type,'Cache-Control':file==='popup.html'?'no-store':'public, max-age=3600'});
    res.end(content);
}).listen(8766,'127.0.0.1',()=>console.log('Popup probe: http://127.0.0.1:8766/popup.html'));
