// Synthetic DOM benchmark of the actual periodic callbacks; not a signed-in CPU trace.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
(async () => {
 const results=[];
 for (const route of ['/campaign-management/#campaign-id=CPTEST', '/home/']) {
  for (const feature of ['reccies-launcher', 'social-campaign-check']) {
   const dom=new JSDOM('<body><nav><button class="toolshed-approval-banner-button">Approvals</button></nav><div class="workflow-widget-wrapper"></div></body>', {url:'https://go.mediaocean.com'+route,runScripts:'dangerously'});
   const w=dom.window; let callback; let queries=0;
   for(const method of ['querySelector','querySelectorAll','getElementById']) {const original=w.document[method].bind(w.document);w.document[method]=(...args)=>{queries++;return original(...args);};}
   w.chrome={storage:{local:{get:async()=>({})},onChanged:{addListener(){}}},runtime:{sendMessage:async()=>({status:'success'})}};
   w.dstAssuranceFeature={hasFacebookBooking:()=>false};
   w.opsToolshedExtensionState={isActive:()=>true,subscribe:fn=>fn(true)};
   w.setInterval=fn=>{callback=fn;return 1;};w.clearInterval=()=>{};
   w.eval(fs.readFileSync(path.join(__dirname,'../features/'+feature+'.js'),'utf8'));
   for(let i=0;i<10;i++)await Promise.resolve();
   for(let i=0;i<100;i++)callback();
   queries=0; const start=performance.now();for(let i=0;i<1000;i++)callback(); const elapsed=performance.now()-start;
   results.push({feature,route,iterations:1000,callbackMeanMs:elapsed/1000,documentQueriesPerCallback:queries/1000,scheduledCallbacksPerMinute:40,estimatedCallbackMsPerMinute:elapsed/1000*40});dom.window.close();
  }
 }
 console.log(JSON.stringify({environment:'Node '+process.version+' / jsdom; static synthetic DOM; empty tracker',results},null,2));
})();
