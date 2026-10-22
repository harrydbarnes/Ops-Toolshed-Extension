'use strict';
const $ = id=>document.getElementById(id);
let report;
$('open').addEventListener('click',async()=>{
    try {
        const url = new URL(PILOT_SERVICE_URL);
        url.searchParams.set('nonce',crypto.randomUUID());
        await chrome.tabs.create({url:url.href});
    } catch(error) {$('status').textContent=error.message;}
});
$('run').addEventListener('click',async()=>{
    $('run').disabled=true; $('download').disabled=true; $('result').textContent=''; report=null;
    $('status').textContent='Checking Google identity, supplied-email handling and POST refusal…';
    try {
        const expected=$('expected').value.trim().toLowerCase();
        if (!expected || !$('expected').checkValidity()) throw Error('Enter your work Google email for local comparison.');
        const response=await chrome.runtime.sendMessage({action:'identityPilot'});
        if (!response?.ok) throw Error(response?.error || 'No response from the test worker.');
        report=response.report;
        report.matchesExpectedUser=report.tests[0].data.activeEmail?.toLowerCase()===expected;
        report.ok=report.ok && report.matchesExpectedUser;
        $('status').textContent=report.ok?'Passed: Google identified your account; supplied email ignored; POST refused.':'Not passed. Check the returned email and test details below.';
        $('result').textContent=JSON.stringify(report,null,2); $('download').disabled=false;
    } catch(error) {$('status').textContent=error.message;}
    finally {$('run').disabled=false;}
});
$('download').addEventListener('click',()=>{
    if (!report) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`identity-pilot-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
