(function(){
    'use strict';
    const origins=['https://script.google.com/*','https://script.googleusercontent.com/*'];
    const trackerId='1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
    const node=(tag,value)=>{const el=document.createElement(tag);if(value)el.textContent=value;return el;};
    function addCloseButton(dialog,close){
        const button=node('button');button.type='button';button.className='tracker-dialog-close';button.setAttribute('aria-label','Close dialog');button.addEventListener('click',close);dialog.append(button);return button;
    }
    window.reccieManualWrites={create(options){
        const recover=document.getElementById('last-tracker-save');
        let latest=null,lastKey='',opening=false;
        const writerMode=window.opsReccieWriterMode||{perUser:false},connectionPanel=document.getElementById('writer-connection');
        let writerReady=!writerMode.perUser,connectionKey='';
        document.getElementById('per-user-writer-test').hidden=!writerMode.perUser;
        if(writerMode.perUser){connectionPanel.hidden=false;document.getElementById('writer-authorise').href=writerMode.endpoint+'?connect=1';}
        async function checkWriterAccess(activate=false,interactive=false){
            const context=options.context(),key=context.mode+'/'+context.month,status=document.getElementById('writer-connection-status');
            writerReady=false;
            status.textContent='Checking your Google account and access to both spreadsheets…';
            const check=document.getElementById('writer-check-access'),enable=document.getElementById('writer-activate');check.disabled=enable.disabled=true;
            try{
                if(!await (interactive?chrome.permissions.request({origins}):chrome.permissions.contains({origins})))throw Error('Connect your Google account, then choose Check access to allow Google script access.');
                if(activate){const stored=await chrome.storage.local.get('reccieAutomation');await chrome.storage.local.set({reccieAutomation:{...(stored.reccieAutomation||{}),autoMark:false,afterFinancial:false,clearCommentsOnMarkYes:false}});}
                const response=await request(activate?'activatePerUserWriter':'trackerWriteConnection',{},context),connection=response.connection;
                if(options.context().mode+'/'+options.context().month!==key)return;
                writerReady=connection.ready===true&&connection.enforced===true&&connection.perUser===true;
                status.textContent=`Connected as ${connection.email}. ${writerReady?'Ready to update the tracker using your Google account.':connection.ready?'Both spreadsheets are accessible. Enable per-user updates to continue.':connection.problems.join(' ')}`;
                enable.hidden=!connection.ready||connection.enforced===true;
            }catch(error){status.textContent=error.message;enable.hidden=true;}
            finally{check.disabled=enable.disabled=false;options.updated(options.context().tracker,options.context());}
        }
        if(writerMode.perUser){
            document.getElementById('writer-check-access').addEventListener('click',()=>void checkWriterAccess(false,true));
            document.getElementById('writer-activate').addEventListener('click',()=>void checkWriterAccess(true,true));
        }
        function available(context){try{return writerReady&&context.tracker?.source?.type==='google'&&['main','early'].includes(context.mode)&&context.tracker.month===context.month&&window.reccieCore.sheetSource(context.tracker.source.url).spreadsheetId===trackerId;}catch(_){return false;}}
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
        async function open(rows,statusOnly,edits,clearComments=false){
            if(opening)return;
            const context=options.context();if(!available(context))return;
            if(rows&&rows.length>100){options.message('This campaign has more than 100 matching D numbers. Narrow the filters before updating.',true);return;}
            opening=true;options.setBusy(true);
            const dialog=node('dialog');dialog.className='tracker-write-dialog';dialog.setAttribute('aria-labelledby','tracker-write-title');
            const title=node('h2',statusOnly?'Tracker save result':'Update Tracker Status');title.id='tracker-write-title';
            const intro=node('p',edits?'This updates tracker comments and the selected Yes/No values only. It does not change Prisma. Non-empty notes highlight matching rows yellow.':'This updates the tracker only. It does not change Prisma. Campaign updates include only D numbers matching your current filters.');
            const status=node('p');const showStatus=(value,active=false)=>window.reccieStatus.render(status,value,active);showStatus('Reading live tracker values and matching D numbers. Google may take up to 25 seconds to respond.',true);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
            const list=node('ul');list.className='tracker-write-rows';
            const label=node('label');const confirm=node('input');confirm.type='checkbox';label.append(confirm,document.createTextNode(edits?' I have reviewed these comments and tracker statuses.':rows?.length===1?' I have reconciled this placement and want to mark it Yes.':' I have reconciled these placements and want to mark them Yes.'));
            const removeLabel=node('label'),removeComments=node('input');removeComments.type='checkbox';removeComments.checked=clearComments;removeComments.setAttribute('aria-label','Remove existing comments when marking Yes');removeLabel.append(removeComments,document.createTextNode(' Remove existing comments when marking Yes'));removeLabel.hidden=true;
            const save=node('button',rows?.length===1?'Confirm update':'Confirm updates'),check=node('button','Check save result'),close=node('button','Cancel');
            save.type=check.type=close.type='button';check.hidden=true;save.disabled=true;label.hidden=save.hidden=!!statusOnly;
            const refresh=node('button','Refresh preview');refresh.type='button';refresh.hidden=true;
            const controls=node('div');controls.className='tracker-write-controls';controls.append(close,refresh,check,save);
            dialog.append(title,intro,status,list,label,removeLabel,controls);document.body.append(dialog);
            let pollTimer=null,pollCount=0,closed=false,completed=false;
            let working=false,preview=null,requestId=statusOnly?latest?.requestId:null;
            function closeDialog(afterClose){
                if(working)return;
                closed=true;clearTimeout(pollTimer);
                const finish=()=>{if(typeof dialog.close==='function')dialog.close();dialog.remove();opening=false;options.setBusy(false);if(typeof afterClose==='function')afterClose();else if(completed)options.finished?.(context);};
                if(!window.reccieUi?.closeDialog(dialog,finish))finish();
            }
            const topClose=addCloseButton(dialog,()=>closeDialog());
            function work(value){working=value;topClose.disabled=value;removeComments.disabled=value;refresh.disabled=value;close.disabled=value;check.disabled=value;confirm.disabled=value;save.disabled=value||!confirm.checked||!preview?.results?.some(r=>['eligible','already_yes','unchanged'].includes(r.state));}
            function display(results){list.replaceChildren(...(results||[]).map(r=>node('li',`${r.dNumber}: ${r.state==='eligible'?`${r.before||'Blank'} → ${r.after||'Yes'}${edits?' · '+(r.commentsAfter||'(empty comment)'):''}`:r.state==='already_yes'?'Already Yes':r.state==='updated'?`Saved ${r.after||'Yes'}${typeof r.commentsAfter==='string'?' · '+r.commentsAfter:''}`:r.reason||r.state}`)));}
            function scheduleCheck(){
                clearTimeout(pollTimer);
                if(closed)return;
                if(pollCount>=60){showStatus('The save is taking longer than expected. Automatic checks have paused. Use Check save result to continue.');return;}
                pollTimer=setTimeout(()=>{pollCount++;void checkResult();},5000);
            }
            function receipt(response){
                removeLabel.hidden=true;
                clearTimeout(pollTimer);
                refresh.hidden=true;
                const result=response.write;display(result.results);label.hidden=save.hidden=true;check.hidden=false;close.textContent='Close';
                if(response.tracker)options.updated(response.tracker,context);
                if(result.state==='complete'){
                    completed=true;check.hidden=true;
                    const saved=result.results.filter(r=>r.state==='updated'&&r.confirmed).length,already=result.results.filter(r=>r.state==='already_yes'&&r.confirmed).length,other=result.results.length-saved-already;
                    showStatus(result.results.some(r=>typeof r.commentsAfter==='string')?`${result.results.filter(r=>r.confirmed).length} confirmed update${result.results.filter(r=>r.confirmed).length===1?'':'s'} · ${result.results.filter(r=>!r.confirmed).length} skipped or not confirmed.`:`${saved} saved Yes · ${already} already Yes · ${other} skipped or not confirmed.`);
                    options.message(status.textContent,other>0);
                }else if(result.state==='pending'){showStatus('Save is still in progress. Checking automatically every five seconds. You can close this window and use Check last tracker save later.',true);scheduleCheck();}
                else {showStatus('No save receipt is available yet. Checking automatically before another update can be started.',true);scheduleCheck();}
            }
            async function checkResult(){if(closed||working)return;clearTimeout(pollTimer);work(true);showStatus('Checking save result',true);try{receipt(await request('trackerWriteStatus',{requestId},context));}catch(error){showStatus(`${error.message} Checking again automatically.`,true);scheduleCheck();}finally{work(false);}}
            refresh.addEventListener('click',()=>{if(working)return;closeDialog(()=>void open(rows,false,edits,clearComments));});
            removeComments.addEventListener('change',()=>{if(working)return;const selected=removeComments.checked;closeDialog(()=>void open(rows,false,edits,selected));});
            close.addEventListener('click',closeDialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
            confirm.addEventListener('change',()=>work(false));check.addEventListener('click',checkResult);
            save.addEventListener('click',async()=>{
                if(working||!confirm.checked||!preview)return;
                work(true);requestId=preview.requestId;remember(requestId,context);removeLabel.hidden=true;refresh.hidden=true;check.hidden=false;showStatus('Saving to the tracker',true);
                try{receipt(await request('commitTrackerWrite',{requestId},context));}
                catch(error){
                    label.hidden=save.hidden=true;close.textContent='Close';
                    if(error.code==='TRANSPORT_UNCERTAIN'){
                        showStatus('Google is taking longer than expected. Checking the save receipt',true);
                        work(false);await checkResult();
                    }else if(error.code==='BUSY_TRY_AGAIN'||/preview expired/i.test(error.message)){showStatus(`${error.message} Use Refresh preview when ready.`);refresh.hidden=false;}
                    else {showStatus(`${error.message} Checking the save result automatically.`,true);scheduleCheck();}
                }
                finally{preview=null;work(false);}
            });
            if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
            work(true);
            try{
                const allowed=await chrome.permissions.request({origins});if(!allowed)throw Error('Google script access was not granted.');
                if(statusOnly){receipt(await request('trackerWriteStatus',{requestId},context));}
                else{
                    const response=await request(edits?'previewTrackerEdit':'previewTrackerWrite',{rowIds:rows.map(r=>r.sourceRow),...(edits?{edits}:clearComments?{clearComments:true}:{})},context);preview=response.write;display(preview.results);
                    if(!edits){
                        const commented=preview.results.filter(item=>item.hasComment||item.commentsBefore?.trim());
                        removeLabel.hidden=!commented.length&&!clearComments;
                        for(const item of commented){const detail=node('li',`${item.dNumber} comment${clearComments?' to remove':''}: ${item.commentsBefore||item.commentPreview||'(existing comment)'}`);list.append(detail);}
                    }
                    const count=preview.results.filter(r=>r.state==='eligible').length;
                    const expiresAt=new Date(Date.now()+(Number(preview.expiresInSeconds)||120)*1000-10000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
                    showStatus(`${edits?'Review the live comments and Yes/No changes below.':count?`${count} D number${count===1?'':'s'} will be marked Yes.`:'No new changes are needed. Confirm to sync already-Yes values.'} Confirm before ${expiresAt}, or refresh the preview.`);
                    refresh.hidden=false;
                }
            }catch(error){showStatus(error.code==='BUSY_TRY_AGAIN'?`${error.message} Use Refresh preview to retry.`:error.message);label.hidden=save.hidden=true;refresh.hidden=!!statusOnly;}
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
            addCloseButton(dialog,close);
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
                const button=node('button',grouped?`Mark ${selected.length} matching D number${selected.length===1?'':'s'} Yes`:'Mark Yes in tracker');button.type='button';button.className='tracker-mark-yes';button.disabled=options.busy();
                button.addEventListener('click',()=>open(selected,false));return button;
            },
            noteButton(rows,grouped){
                if(!available(options.context()))return null;
                const selected=rows.filter(row=>!row.issue);if(!selected.length)return null;
                const button=node('button',grouped?'Note / status':'Note');button.type='button';button.className='tracker-note';button.disabled=options.busy();
                button.addEventListener('click',()=>{if(selected.length>100){options.message('Narrow the filters to at most 100 D numbers before editing notes.',true);return;}editNotes(selected);});return button;
            },
            refresh(){
                const context=options.context();
                if(writerMode.perUser&&connectionKey!==context.mode+'/'+context.month){connectionKey=context.mode+'/'+context.month;void checkWriterAccess();}
if(!available(context)){recover.hidden=true;lastKey='';latest=null;return;}
                const key=`reccieManualSave:${context.mode}:${context.month}`;if(lastKey===key)return;lastKey=key;recover.hidden=true;
                chrome.storage.local.get(key).then(saved=>{if(lastKey===key&&saved[key]?.requestId)remember(saved[key].requestId,context);}).catch(()=>{});
            }
        };
    }};
})();
