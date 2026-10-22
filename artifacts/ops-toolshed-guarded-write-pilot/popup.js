'use strict';
const $=id=>document.getElementById(id);
let report=null,busy=false,prepared=false;
function update(){['access','prepare'].forEach(id=>$(id).disabled=busy);$('confirm').disabled=busy||!prepared;$('run').disabled=busy||!prepared||!$('confirm').checked;}
async function call(operation){
    busy=true;update();$('status').textContent=operation==='roundTrip'?'Writing Yes and restoring No… Keep this popup open.':'Checking…';
    try{
        const response=await chrome.runtime.sendMessage({action:'writePilot',operation});
        if(!response?.ok)throw Error(response?.error||'Worker did not respond.');
        const data=response.data;
        report={at:new Date().toISOString(),transport:'extension-service-worker',operation,result:data};
        $('result').textContent=JSON.stringify(report,null,2);$('download').disabled=false;
        if(operation==='access'){$('write-test').hidden=!(data.ok&&data.tester&&data.testEnabled);prepared=false;}
        if(operation==='prepare'){prepared=!!data.ok;$('confirm').checked=false;$('preview').textContent=data.ok?`${data.sheet}, row ${data.row}: ${data.dNumber}, ${data.month}. Original: ${data.original}. Confirm within 2 minutes.`:'';}
        if(operation==='roundTrip'){prepared=false;$('confirm').checked=false;}
        $('status').textContent=data.ok?(operation==='roundTrip'?'Test passed: Yes confirmed and No restored.':operation==='prepare'?'Preview ready. No spreadsheet change yet.':'Access allowed.'):(data.error||'Test failed.');
        if(data.restored===false)$('status').textContent='RESTORATION FAILED — check D03120200 in the tracker immediately. Do not repeat the test.';
    }catch(error){$('status').textContent=error.message;if(operation==='roundTrip'){$('status').textContent+=' The server may still be restoring No. Check the tracker before retrying.';prepared=false;}}
    finally{busy=false;update();}
}
$('access').addEventListener('click',()=>call('access'));
$('prepare').addEventListener('click',()=>call('prepare'));
$('run').addEventListener('click',()=>call('roundTrip'));
$('confirm').addEventListener('change',update);
$('download').addEventListener('click',()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`reccie-write-pilot-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
