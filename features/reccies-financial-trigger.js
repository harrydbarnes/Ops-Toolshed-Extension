(function(){
    'use strict';
    if(window.opsReccieFinancialTrigger)return;window.opsReccieFinancialTrigger=true;
    const candidates=new Map(),changes=new Map();let observer=null,scanTimer=null;
    const active=()=>window.opsToolshedExtensionState?.isActive();
    const context=()=>{const p=new URLSearchParams(location.hash.slice(1));return {campaignId:p.get('campaign-id'),month:p.get('mos')?.slice(0,7),actualise:p.get('ptb-ctx')==='actualize'};};
    function visibleRows(){
        const ctx=context();if(!ctx.actualise||!/^20\d\d-(0[1-9]|1[0-2])$/.test(ctx.month||''))return [];
        return [...document.querySelectorAll('#grid-container_hot button.ok-to-pay-buy[data-row-status-value]')].map(button=>{
            const placementId=button.closest('tr')?.querySelector('[id^="placementNumber-"]')?.textContent.trim(),value=button.getAttribute('data-row-status-value');
            return /^P[A-Z0-9]{3,20}$/.test(placementId||'')&&['0','1'].includes(value)?{...ctx,placementId,value}:null;
        }).filter(Boolean);
    }
    const key=row=>`${row.campaignId}/${row.month}/${row.placementId}`;
    function scan(){
        scanTimer=null;if(!active())return;
        for(const row of visibleRows()){
            const id=key(row),before=candidates.get(id);if(!before)continue;
            if(before.value===row.value)changes.delete(id);
            else changes.set(id,{...row,before:before.value});
        }
    }
    function queueScan(){if(scanTimer===null)scanTimer=setTimeout(scan,0);}
    function captureBefore(){
        for(const row of visibleRows()){const id=key(row);if(!candidates.has(id)&&candidates.size<1000)candidates.set(id,row);}
        observer?.disconnect();const grid=document.getElementById('grid-container_hot');
        if(grid){observer=new MutationObserver(queueScan);observer.observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['data-row-status-value']});}
    }
    document.addEventListener('click',event=>{
        if(!event.isTrusted||!active()||!context().actualise)return;
        const path=event.composedPath();
        if(path.some(node=>node?.matches?.('td[id^="okToPay-"]'))){captureBefore();return;}
        const confirm=path.find(node=>node?.id==='confirm-button');
        if(!confirm||confirm.matches('.mo-btn-disabled,[disabled],[aria-disabled="true"]'))return;
        const modal=confirm.closest('.buyConfirmationDialogModal');
        if(!modal?.querySelector('#BuyConfirmationDialog-header-title')?.textContent.startsWith('Confirm financial update'))return;
        scan();const ctx=context(),eligible=new Set();
        for(const row of modal.querySelectorAll('.detailRow')){
            if(row.querySelector('.not-ready-buys')||/no changes since/i.test(row.textContent))continue;
            const cells=row.querySelectorAll('.mo-flex-table-cell'),id=cells[3]?.textContent.trim(),date=cells[1]?.textContent.trim().match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
            if(/^P[A-Z0-9]{3,20}$/.test(id||'')&&date)eligible.add(`${date[3]}-${date[2]}/${id}`);
        }
        const groups=new Map();
        for(const [id,row]of changes){
            if(row.campaignId!==ctx.campaignId||!eligible.has(`${row.month}/${row.placementId}`))continue;
            if(!groups.has(row.month))groups.set(row.month,[]);groups.get(row.month).push(row.placementId);
            candidates.set(id,row);changes.delete(id);
        }
        if(groups.size)chrome.runtime.sendMessage({action:'reccieFinancialUpdate',changes:[...groups].map(([month,placementIds])=>({month,placementIds}))}).catch(()=>{});
    },true);
    window.opsToolshedExtensionState?.subscribe?.(enabled=>{if(!enabled){observer?.disconnect();candidates.clear();changes.clear();if(scanTimer!==null)clearTimeout(scanTimer);scanTimer=null;}});
    window.addEventListener('hashchange',()=>{observer?.disconnect();});
})();
