const {JSDOM}=require('jsdom');const path=require('path');const {readScript}=require('../helpers/read-script');const {captureTrustedListener}=require('../helpers/trusted-dom-event');
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
async function setup(before='0'){
    const dom=new JSDOM(`<div id="grid-container_hot"><table><tr><td id="placementNumber-2">P3FLH1P</td><td id="okToPay-2"><button class="ok-to-pay-buy" data-row-status-value="${before}">Status</button></td></tr></table></div><div class="buyConfirmationDialogModal"><div id="BuyConfirmationDialog-header-title">Confirm financial update for Apr 26</div><div class="detailRow"><div class="mo-flex-table-cell"></div><div class="mo-flex-table-cell">01/04/2026</div><div class="mo-flex-table-cell">Name</div><div class="mo-flex-table-cell">P3FLH1P</div></div><div id="confirm-button">Confirm</div><a id="cancel-button">Cancel</a></div>`,{url:'https://go.mediaocean.com/campaign-management/#campaign-id=CP3G9KS&ptb-ctx=actualize&mos=2026-04-01',runScripts:'outside-only'});
    const win=dom.window,click=captureTrustedListener(win,win.document,'click');win.opsToolshedExtensionState={isActive:()=>true,subscribe:()=>{}};win.chrome={runtime:{sendMessage:jest.fn(async()=>({status:'success'}))}};
    win.eval(readScript(path.resolve(__dirname,'../../features/reccies-financial-trigger.js')));
    const button=win.document.querySelector('.ok-to-pay-buy'),confirm=win.document.getElementById('confirm-button');
    return {dom,win,click,button,confirm};
}
test.each([['0','1'],['1','0']])('only confirmation of an observed %s to %s transition schedules the affected placement',async(before,after)=>{
    const t=await setup(before);try{
        t.click(t.button);t.button.setAttribute('data-row-status-value',after);await flush();expect(t.win.chrome.runtime.sendMessage).not.toHaveBeenCalled();
        t.click(t.confirm);expect(t.win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccieFinancialUpdate',changes:[{month:'2026-04',placementIds:['P3FLH1P']}]});
        t.click(t.confirm);expect(t.win.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    }finally{t.dom.window.close();}
});
test.each(['gross-only','no-changes','not-ready','cancel','synthetic','disabled','different-month','reverted'])('ignores %s financial actions',async(reason)=>{
    const t=await setup();try{
        t.click(t.button);if(reason!=='gross-only')t.button.setAttribute('data-row-status-value','1');await flush();
        if(reason==='no-changes')t.win.document.querySelector('.detailRow').append('No changes since last financial update.');
        if(reason==='not-ready')t.win.document.querySelector('.detailRow').innerHTML+='<span class="not-ready-buys"></span>';
        if(reason==='disabled')t.confirm.classList.add('mo-btn-disabled');
        if(reason==='different-month')t.win.document.querySelectorAll('.detailRow .mo-flex-table-cell')[1].textContent='01/05/2026';
        if(reason==='reverted'){t.button.setAttribute('data-row-status-value','0');await flush();}
        if(reason==='synthetic')t.confirm.click();else t.click(reason==='cancel'?t.win.document.getElementById('cancel-button'):t.confirm);
        expect(t.win.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    }finally{t.dom.window.close();}
});
