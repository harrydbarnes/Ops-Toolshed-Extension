(function(){
    'use strict';
    const origins=['https://script.google.com/*','https://script.googleusercontent.com/*'];
    const trackerId='1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
    const node=(tag,value)=>{const el=document.createElement(tag);if(value)el.textContent=value;return el;};
    window.reccieManualWrites={create(options){
        const recover=document.getElementById('last-tracker-save');
        let latest=null,lastKey='',opening=false;
        function available(context){try{return context.tracker?.source?.type==='google'&&['main','early'].includes(context.mode)&&context.tracker.month===context.month&&window.reccieCore.sheetSource(context.tracker.source.url).spreadsheetId===trackerId;}catch(_){return false;}}
        function remember(requestId,context){latest={requestId,mode:context.mode,month:context.month};recover.hidden=false;}
        async function request(operation,args,context){
            let response;
            try {
                response=await chrome.runtime.sendMessage({action:'reccies',operation,mode:context.mode,month:context.month,revision:context.tracker?.revision,...args});
            } catch (cause) {
                const error=Error('Could not confirm the tracker response.', {cause});
                error.code='TRANSPORT_UNCERTAIN';
                throw error;
            }
            if(response?.status!=='success'){
                const error=Error(response?.message||'Could not reach tracker update service.');
                if(response?.code)error.code=response.code;
                throw error;
            }
            return response;
        }
        async function open(rows,statusOnly,edits){
            if(opening)return;
            const context=options.context();if(!available(context))return;
            if(rows&&rows.length>100){options.message('This campaign has more than 100 matching D numbers. Narrow the filters before updating.',true);return;}
            opening=true;options.setBusy(true);
            const dialog=node('dialog');dialog.className='tracker-write-dialog';dialog.setAttribute('aria-labelledby','tracker-write-title');
            const title=node('h2',statusOnly?'Tracker save result':'Update Tracker Status');title.id='tracker-write-title';
            const intro=node('p',edits?'This updates tracker comments and the selected Yes/No values only. It does not change Prisma. Non-empty notes highlight matching rows yellow.':'This updates the tracker only. It does not change Prisma. Campaign updates include only D numbers matching your current filters.');
            const status=node('p');const showStatus=(value,active=false)=>window.reccieStatus.render(status,value,active);showStatus('Reading the live tracker',true);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
            const list=node('ul');list.className='tracker-write-rows';
            const label=node('label');const confirm=node('input');confirm.type='checkbox';label.append(confirm,document.createTextNode(edits?' I have reviewed these comments and tracker statuses.':' I have reconciled these placements and want to mark them Yes.'));
            const save=node('button','Confirm Update(s)'),check=node('button','Check save result'),close=node('button','Cancel');
            save.type=check.type=close.type='button';check.hidden=true;save.disabled=true;label.hidden=save.hidden=!!statusOnly;
            const controls=node('div');controls.className='tracker-write-controls';controls.append(close,check,save);
            dialog.append(title,intro,status,list,label,controls);document.body.append(dialog);
            let working=false,preview=null,requestId=statusOnly?latest?.requestId:null;
            function closeDialog(){
                if(working)return;
                const finish=()=>{if(typeof dialog.close==='function')dialog.close();dialog.remove();opening=false;options.setBusy(false);};
                if(!window.reccieUi?.closeDialog(dialog,finish))finish();
            }
            function work(value){working=value;close.disabled=value;check.disabled=value;confirm.disabled=value;save.disabled=value||!confirm.checked||!preview?.results?.some(r=>['eligible','already_yes','unchanged'].includes(r.state));}
            function display(results){list.replaceChildren(...(results||[]).map(r=>node('li',`${r.dNumber}: ${r.state==='eligible'?`${r.before||'Blank'} → ${r.after||'Yes'}${edits?' · '+(r.commentsAfter||'(empty comment)'):''}`:r.state==='already_yes'?'Already Yes':r.state==='updated'?`Saved ${r.after||'Yes'}${typeof r.commentsAfter==='string'?' · '+r.commentsAfter:''}`:r.reason||r.state}`)));}
            function receipt(response){
                const result=response.write;display(result.results);label.hidden=save.hidden=true;check.hidden=false;close.textContent='Close';
                if(response.tracker)options.updated(response.tracker,context);
                if(result.state==='complete'){
                    const saved=result.results.filter(r=>r.state==='updated'&&r.confirmed).length,already=result.results.filter(r=>r.state==='already_yes'&&r.confirmed).length,other=result.results.length-saved-already;
                    showStatus(result.results.some(r=>typeof r.commentsAfter==='string')?`${result.results.filter(r=>r.confirmed).length} confirmed update(s) · ${result.results.filter(r=>!r.confirmed).length} skipped or not confirmed.`:`${saved} saved Yes · ${already} already Yes · ${other} skipped or not confirmed.`);
                    options.message(status.textContent,other>0);
                }else showStatus(result.state==='not_started'?'No save started for this request. Close this result and open a new preview.':'Save is still in progress. Check the result again shortly; do not resend it.',result.state==='pending');
            }
            async function checkResult(){work(true);showStatus('Checking save result',true);try{receipt(await request('trackerWriteStatus',{requestId},context));}catch(error){showStatus(error.message);}finally{work(false);}}
            close.addEventListener('click',closeDialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
            confirm.addEventListener('change',()=>work(false));check.addEventListener('click',checkResult);
            save.addEventListener('click',async()=>{
                if(working||!confirm.checked||!preview)return;
                work(true);requestId=preview.requestId;remember(requestId,context);check.hidden=false;showStatus('Saving to the tracker',true);
                try{receipt(await request('commitTrackerWrite',{requestId},context));}
                catch(error){
                    label.hidden=save.hidden=true;close.textContent='Close';
                    if(error.code==='TRANSPORT_UNCERTAIN'){
                        showStatus('Google is taking longer than expected. Checking the save receipt',true);
                        await checkResult();
                    }else showStatus(`${error.message} The save may still be running. Use Check save result before trying another update.`);
                }
                finally{preview=null;work(false);}
            });
            if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
            work(true);
            try{
                const allowed=await chrome.permissions.request({origins});if(!allowed)throw Error('Google script access was not granted.');
                if(statusOnly){receipt(await request('trackerWriteStatus',{requestId},context));}
                else{
                    const response=await request(edits?'previewTrackerEdit':'previewTrackerWrite',{rowIds:rows.map(r=>r.sourceRow),...(edits?{edits}:{})},context);preview=response.write;display(preview.results);
                    const count=preview.results.filter(r=>r.state==='eligible').length;
                    showStatus(edits?'Review the live comments and Yes/No changes below. Non-empty notes highlight the matching tracker rows yellow. Confirm within two minutes.':count?`${count} D number${count===1?'':'s'} will be marked Yes. Review this live preview and confirm within two minutes.`:'No new changes are needed. Confirm to sync any already-Yes tracker values, or close to review skipped items.');
                }
            }catch(error){showStatus(error.message);label.hidden=save.hidden=true;}
            finally{work(false);}
        }
        function editNotes(rows){
            if(opening)return;
            const dialog=node('dialog');dialog.className='tracker-write-dialog tracker-note-dialog';
            dialog.setAttribute('aria-labelledby','tracker-note-title');
            const title=node('h2','Note and tracker status');title.id='tracker-note-title';
            dialog.append(title,node('p','Edit the matching D numbers below. Non-empty comments highlight their tracker rows yellow. This does not change Prisma.'));
            const edits=[];
            rows.forEach(row=>{
                const section=node('fieldset');section.append(node('legend',row.dNumber));
                const label=node('label','Tracker status');const select=node('select');select.setAttribute('aria-label',row.dNumber+' tracker status');
                if(!['yes','no'].includes(row.reccied.trim().toLowerCase())){const blank=node('option',row.reccied||'Blank — choose Yes or No');blank.value='';blank.disabled=true;blank.selected=true;select.append(blank);}
                for(const value of ['Yes','No']){const option=node('option',value);option.value=value;option.selected=row.reccied.trim().toLowerCase()===value.toLowerCase();select.append(option);}
                label.append(select);
                const commentLabel=node('label','Comments');const area=node('textarea');area.value=row.comments||'';area.maxLength=2000;area.rows=3;area.setAttribute('aria-label',row.dNumber+' comments');commentLabel.append(area);
                const chips=node('div');chips.className='tracker-note-chips';
                for(const value of ['Waiting on Supplier Spend','Delivery Stats Issue/Query']){const chip=node('button',value);chip.type='button';chip.addEventListener('click',()=>{const parts=area.value.split('\n');if(!parts.includes(value))area.value=[area.value.trimEnd(),value].filter(Boolean).join('\n');area.dispatchEvent(new Event('input'));area.focus();});chips.append(chip);}
                section.append(label,commentLabel,chips);dialog.append(section);edits.push({row,select,area});
            });
            const error=node('p');error.setAttribute('role','alert');
            const cancel=node('button','Cancel'),next=node('button','Preview Update(s)');cancel.type=next.type='button';const bar=node('div');bar.className='tracker-write-controls';bar.append(cancel,next);dialog.append(error,bar);
            const close=()=>{const finish=()=>{dialog.close?.();dialog.remove();opening=false;options.setBusy(false);};if(!window.reccieUi?.closeDialog(dialog,finish))finish();};
            cancel.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
            next.addEventListener('click',()=>{
                if(edits.some(edit=>!['Yes','No'].includes(edit.select.value)||edit.area.value.length>2000||/^\s*=/.test(edit.area.value))){error.textContent='Choose Yes or No for each D number. Notes must be at most 2,000 characters and cannot start with =.';return;}
                const changes=edits.map(edit=>({sourceRow:edit.row.sourceRow,reccied:edit.select.value,comments:edit.area.value}));
                // Remove this editor before opening the guarded live preview.
                dialog.close?.();dialog.remove();opening=false;options.setBusy(false);open(rows,false,changes);
            });
            opening=true;options.setBusy(true);document.body.append(dialog);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
        }
        recover.addEventListener('click',()=>{if(latest)open(null,true);});
        return {
            available:()=>available(options.context()),
            button(rows,grouped){
                const context=options.context();if(!available(context))return null;
                const selected=rows.filter(r=>!r.issue&&r.reccied.trim().toLowerCase()!=='yes');if(!selected.length)return null;
                const button=node('button',grouped?`Mark ${selected.length} matching D numbers Yes`:'Mark Yes in tracker');button.type='button';button.className='tracker-mark-yes';button.disabled=options.busy();
                button.addEventListener('click',()=>open(selected,false));return button;
            },
            noteButton(rows,grouped){
                if(!available(options.context()))return null;
                const selected=rows.filter(row=>!row.issue);if(!selected.length)return null;
                const button=node('button',grouped?'Note / status':'Note');button.type='button';button.className='tracker-note';button.disabled=options.busy();
                button.addEventListener('click',()=>{if(selected.length>100){options.message('Narrow the filters to at most 100 D numbers before editing notes.',true);return;}editNotes(selected);});return button;
            },
            refresh(){
                const context=options.context();if(!available(context)){recover.hidden=true;lastKey='';latest=null;return;}
                const key=`reccieManualSave:${context.mode}:${context.month}`;if(lastKey===key)return;lastKey=key;recover.hidden=true;
                chrome.storage.local.get(key).then(saved=>{if(lastKey===key&&saved[key]?.requestId)remember(saved[key].requestId,context);}).catch(()=>{});
            }
        };
    }};
})();
