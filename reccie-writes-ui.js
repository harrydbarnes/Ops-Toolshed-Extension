(function(){
    'use strict';
    const origins=['https://script.google.com/*','https://script.googleusercontent.com/*'];
    const trackerId='1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
    const accessErrors=new Set(['ACCOUNT_CHANGED','ACCESS_DENIED','IDENTITY_UNAVAILABLE','PER_USER_REQUIRED','PER_USER_SETUP_REQUIRED','PER_USER_ACCESS_REQUIRED','WRITER_ACCESS_CHECK_REQUIRED','WRITER_PERMISSION_REQUIRED','WRITER_SIGN_IN_REQUIRED','MANUAL_WRITES_DISABLED']);
    const node=(tag,value)=>{const el=document.createElement(tag);if(value)el.textContent=value;return el;};
    function addCloseButton(dialog,close){
        const button=node('button');button.type='button';button.className='tracker-dialog-close';button.setAttribute('aria-label','Close dialog');button.addEventListener('click',close);dialog.append(button);return button;
    }
    window.reccieManualWrites={create(options){
        const recover=document.getElementById('last-tracker-save');
        let latest=null,lastKey='',opening=false;
        const writerMode=window.opsReccieWriterMode||{perUser:false},connectionPanel=document.getElementById('writer-connection');
        const main=document.querySelector('main');
        const topSlot=document.getElementById('writer-top-slot');
        const settingsSlot=document.getElementById('writer-settings-slot');
        let writerReady=!writerMode.perUser,connectionKey='',connectionSequence=0,hasConfirmedAccount=false,skippedSetup=false,checkingSilently=false;
        const connectionStatus=document.getElementById('writer-connection-status');
        const connectionSummary=document.getElementById('writer-connection-summary');
        const activationHint=document.getElementById('writer-activation-hint');
        const check=document.getElementById('writer-check-access'),enable=document.getElementById('writer-activate');
        const authoriseLink=document.getElementById('writer-authorise');
        const skipReadOnly=document.getElementById('writer-skip-readonly');
        const resetAccount=document.getElementById('writer-reset-account');
        const setConnectionStatus=(value,active=false)=>{
            if(window.reccieStatus?.render)window.reccieStatus.render(connectionStatus,value,active);
            else connectionStatus.textContent=value;
        };
        function syncConnectionLayout(){
            if(!writerMode.perUser||!connectionPanel)return;
            const awaitingActivation=!enable.hidden&&!writerReady;
            if(authoriseLink)authoriseLink.classList.toggle('is-secondary',awaitingActivation||writerReady);
            if(writerReady||(hasConfirmedAccount&&checkingSilently)){
                main?.classList.remove('is-writer-setup-gate');
                connectionPanel.classList.remove('is-writer-step-one','is-writer-alert');
                connectionPanel.classList.add('is-writer-tucked');
                if(settingsSlot&&connectionPanel.parentElement!==settingsSlot)settingsSlot.append(connectionPanel);
                connectionPanel.open=false;
                connectionPanel.classList.remove('reccie-is-open');
                connectionSummary.textContent=writerReady?'Google account connected':'Checking Google account…';
                if(skipReadOnly)skipReadOnly.hidden=true;
                if(resetAccount)resetAccount.hidden=!writerReady;
            }else if(!hasConfirmedAccount&&!skippedSetup){
                main?.classList.add('is-writer-setup-gate');
                connectionPanel.classList.add('is-writer-step-one');
                connectionPanel.classList.remove('is-writer-tucked','is-writer-alert');
                if(topSlot&&connectionPanel.parentElement!==topSlot)topSlot.append(connectionPanel);
                connectionPanel.open=true;
                connectionPanel.classList.add('reccie-is-open');
                connectionSummary.textContent='Step 1: Connect your Google account';
                if(skipReadOnly)skipReadOnly.hidden=false;
                if(resetAccount)resetAccount.hidden=true;
            }else{
                main?.classList.remove('is-writer-setup-gate');
                connectionPanel.classList.add('is-writer-alert');
                connectionPanel.classList.remove('is-writer-tucked','is-writer-step-one');
                if(topSlot&&connectionPanel.parentElement!==topSlot)topSlot.append(connectionPanel);
                connectionPanel.open=true;
                connectionPanel.classList.add('reccie-is-open');
                connectionSummary.textContent='Google account for tracker updates';
                if(skipReadOnly)skipReadOnly.hidden=true;
                if(resetAccount)resetAccount.hidden=!hasConfirmedAccount;
            }
        }
        function showAccessProblem(message){
            writerReady=false;
            checkingSilently=false;
            setConnectionStatus(message,false);
            enable.hidden=activationHint.hidden=true;
            syncConnectionLayout();
        }
        function confirmDisconnect(){
            if(opening)return;
            opening=true;
            const dialog=node('dialog');dialog.className='tracker-write-dialog';dialog.setAttribute('aria-labelledby','writer-disconnect-title');
            const title=node('h2','Disconnect Google account?');title.id='writer-disconnect-title';
            const intro=node('p','This disconnects your Google account from Reccies on this browser and returns to Step 1 setup. You can reconnect at any time.');
            const cancel=node('button','Cancel'),confirmBtn=node('button','Disconnect');
            cancel.type=confirmBtn.type='button';
            const controls=node('div');controls.className='tracker-write-controls';controls.append(cancel,confirmBtn);
            dialog.append(title,intro,controls);
            const close=(afterClose)=>{
                const finish=()=>{dialog.close?.();dialog.remove();opening=false;if(typeof afterClose==='function')afterClose();};
                if(!window.reccieUi?.closeDialog(dialog,finish))finish();
            };
            addCloseButton(dialog,()=>close());
            cancel.addEventListener('click',()=>close());
            dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
            confirmBtn.addEventListener('click',()=>{
                confirmBtn.disabled=cancel.disabled=true;
                close(async()=>{
                    connectionSequence++;
                    writerReady=false;hasConfirmedAccount=false;skippedSetup=false;checkingSilently=false;
                    try{await chrome.storage.local.remove('reccieConfirmedWriterIdentity');}catch(_){}
                    try{await chrome.storage.session?.remove('recciePerUserWriterIdentity');}catch(_){}
                    enable.hidden=activationHint.hidden=true;
                    check.classList.remove('primary');
                    if(authoriseLink)authoriseLink.classList.remove('is-secondary');
                    setConnectionStatus("1. Click 'Connect my Google account' and sign in with your work account. 2. Return here and click 'Check access'.",false);
                    syncConnectionLayout();
                    if(!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches&&typeof connectionPanel.animate==='function'){
                        connectionPanel.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
                    }
                    options.updated(options.context().tracker,options.context());
                });
            });
            document.body.append(dialog);
            if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
        }
        if(writerMode.perUser){
            connectionPanel.hidden=false;
            if(authoriseLink){
                authoriseLink.href=writerMode.endpoint+'?connect=1';
                authoriseLink.addEventListener('click',async event=>{
                    if(!chrome.tabs?.create)return;
                    event.preventDefault();
                    authoriseLink.classList.add('is-secondary');
                    check.classList.add('primary');
                    setConnectionStatus("Signing in with Google… This tab will close automatically once connected.",true);
                    let permissionGranted=false;
                    try{permissionGranted=await chrome.permissions.request({origins});}catch(_){}
                    try{
                        const tab=await chrome.tabs.create({url:writerMode.endpoint+'?connect=1',active:true});
                        if(tab?.id!=null&&chrome.tabs.onUpdated){
                            const cleanup=()=>{chrome.tabs.onUpdated.removeListener(onUpdated);chrome.tabs.onRemoved?.removeListener(onRemoved);};
                            const onRemoved=closedId=>{if(closedId===tab.id){cleanup();setConnectionStatus("Sign-in tab closed. Click 'Connect my Google account' to try again, or 'Check access' if you finished.",false);}};
                            const onUpdated=(updatedId,changeInfo,updatedTab)=>{
                                if(updatedId!==tab.id)return;
                                const currentUrl=changeInfo.url||updatedTab?.url||'';
                                if(currentUrl.startsWith('https://script.googleusercontent.com/')&&changeInfo.status==='complete'){
                                    cleanup();
                                    chrome.tabs.remove(tab.id).catch(()=>{});
                                    if(permissionGranted)void checkWriterAccess(false,true);
                                    else setConnectionStatus("Google sign-in finished. Click 'Check access' below to continue.",false);
                                }
                            };
                            chrome.tabs.onUpdated.addListener(onUpdated);
                            chrome.tabs.onRemoved?.addListener(onRemoved);
                        }
                    }catch(_){
                        setConnectionStatus("Finish signing in on the Google tab, then click 'Check access' below.",false);
                        window.open(writerMode.endpoint+'?connect=1','_blank','noopener');
                    }
                });
            }
            if(skipReadOnly)skipReadOnly.addEventListener('click',()=>{skippedSetup=true;syncConnectionLayout();});
            if(resetAccount)resetAccount.addEventListener('click',()=>confirmDisconnect());
            Promise.resolve(chrome.storage.local.get('reccieConfirmedWriterIdentity')).then(stored=>{
                if(stored?.reccieConfirmedWriterIdentity){hasConfirmedAccount=true;checkingSilently=true;}
                syncConnectionLayout();
            }).catch(()=>syncConnectionLayout());
        }
        async function checkWriterAccess(activate=false,interactive=false){
            const context=options.context(),sequence=++connectionSequence;
            writerReady=false;
            checkingSilently=!interactive&&!activate&&hasConfirmedAccount;
            setConnectionStatus(activate?'Enabling tracker updates for your Google account':'Checking your Google account and spreadsheet access',true);
            check.disabled=enable.disabled=true;
            if(activate)enable.textContent='Enabling…';
            else check.textContent='Checking…';
            try{
                const storedIdentity=await chrome.storage.local.get('reccieConfirmedWriterIdentity');
                if(storedIdentity?.reccieConfirmedWriterIdentity){hasConfirmedAccount=true;if(!interactive&&!activate){checkingSilently=true;syncConnectionLayout();}}
                if(!await (interactive?chrome.permissions.request({origins}):chrome.permissions.contains({origins})))throw Error("Click 'Connect my Google account' first, then click 'Check access' to allow Google script access.");
                if(sequence!==connectionSequence)return;
                if(activate){const stored=await chrome.storage.local.get('reccieAutomation');await chrome.storage.local.set({reccieAutomation:{...(stored.reccieAutomation||{}),autoMark:false,afterFinancial:false,clearCommentsOnMarkYes:false}});}
                const response=await request(activate?'activatePerUserWriter':'trackerWriteConnection',{confirmAccount:interactive&&!activate},context),connection=response.connection;
                if(sequence!==connectionSequence)return;
                checkingSilently=false;
                if(connection.enforced===true)hasConfirmedAccount=true;
                writerReady=connection.ready===true&&connection.enforced===true&&connection.perUser===true;
                setConnectionStatus(`Connected as ${connection.email}. ${writerReady?'Ready to update the tracker using your Google account.':connection.ready?"Both spreadsheets are accessible. Click 'Use my Google account for updates' to finish setup.":connection.problems.join(' ')}`,false);
                enable.hidden=!connection.ready||connection.enforced===true;
                activationHint.hidden=enable.hidden;
                check.classList.remove('primary');
                syncConnectionLayout();
                if(activate&&writerReady)options.message(`Connected as ${connection.email}. Ready to update the tracker.`);
            }catch(error){if(sequence===connectionSequence)showAccessProblem(error.message);}
            finally{
                if(sequence===connectionSequence){
                    checkingSilently=false;
                    check.textContent='Check access';
                    enable.textContent='Use my Google account for updates';
                    check.disabled=enable.disabled=false;
                    options.updated(options.context().tracker,options.context());
                }
            }
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
                if(writerMode.perUser&&opening&&accessErrors.has(error.code)){
                    showAccessProblem(error.message);
                    options.updated(options.context().tracker,options.context());
                }
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
            intro.className='tracker-write-intro';
            const status=node('p');status.className='tracker-write-status';const showStatus=(value,active=false)=>window.reccieStatus.render(status,value,active);showStatus('Reading live tracker values and matching D numbers. Google may take up to 25 seconds to respond.',true);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
            const list=node('ul');list.className='tracker-write-rows';
            if(!statusOnly&&Array.isArray(rows)&&rows.length){
                const editMap=Array.isArray(edits)?new Map(edits.map(edit=>[edit.sourceRow,edit])):null;
                list.replaceChildren(...rows.map(row=>{
                    const edit=editMap?.get(row.sourceRow);
                    return node('li',edit?`${row.dNumber}: ${row.reccied||'Blank'} → ${edit.reccied}${edit.comments?' · '+edit.comments:''}`:`${row.dNumber}: ${row.reccied||'Blank'} → Yes`);
                }));
            }
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
                const result=response.write;display(result.results);label.hidden=save.hidden=true;check.hidden=result.state==='complete';close.textContent='Close';
                if(response.tracker)options.updated(response.tracker,context);
                if(result.state==='complete'){
                    completed=true;
                    const saved=result.results.filter(r=>r.state==='updated'&&r.confirmed).length,already=result.results.filter(r=>r.state==='already_yes'&&r.confirmed).length,other=result.results.length-saved-already;
                    showStatus(result.results.some(r=>typeof r.commentsAfter==='string')?`${result.results.filter(r=>r.confirmed).length} confirmed update${result.results.filter(r=>r.confirmed).length===1?'':'s'} · ${result.results.filter(r=>!r.confirmed).length} skipped or not confirmed.`:`${saved} saved Yes · ${already} already Yes · ${other} skipped or not confirmed.`);
                    options.message(status.textContent,other>0);
                }else if(result.state==='pending'){showStatus('Save is still in progress. Checking automatically every five seconds. You can close this window and use Check last tracker save later.',true);scheduleCheck();}
                else {showStatus('No save receipt is available yet. Checking automatically before another update can be started.',true);scheduleCheck();}
            }
            async function checkResult(){if(closed||working)return;clearTimeout(pollTimer);work(true);showStatus('Checking save result',true);try{receipt(await request('trackerWriteStatus',{requestId},context));}catch(error){if(accessErrors.has(error.code)){showStatus(error.message);close.textContent='Close';}else{showStatus(`${error.message} Checking again automatically.`,true);scheduleCheck();}}finally{work(false);}}
            refresh.addEventListener('click',()=>{if(working)return;closeDialog(()=>void open(rows,false,edits,clearComments));});
            removeComments.addEventListener('change',()=>{if(working)return;const selected=removeComments.checked;closeDialog(()=>void open(rows,false,edits,selected));});
            close.addEventListener('click',closeDialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
            confirm.addEventListener('change',()=>work(false));check.addEventListener('click',checkResult);
            save.addEventListener('click',async()=>{
                if(working||!confirm.checked||!preview)return;
                work(true);requestId=preview.requestId;remember(requestId,context);label.hidden=save.hidden=removeLabel.hidden=refresh.hidden=check.hidden=true;showStatus('Saving to the tracker',true);
                try{receipt(await request('commitTrackerWrite',{requestId},context));}
                catch(error){
                    label.hidden=save.hidden=true;close.textContent='Close';
                    if(error.code==='TRANSPORT_UNCERTAIN'){
                        check.hidden=false;
                        showStatus('Google is taking longer than expected. Checking the save receipt',true);
                        work(false);await checkResult();
                    }else if(error.code==='BUSY_TRY_AGAIN'||/preview expired/i.test(error.message)){check.hidden=true;showStatus(`${error.message} Use Refresh preview when ready.`);refresh.hidden=false;}
                    else if(accessErrors.has(error.code)){check.hidden=true;showStatus(error.message);}
                    else {check.hidden=false;showStatus(`${error.message} Checking the save result automatically.`,true);scheduleCheck();}
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
            }catch(error){showStatus(error.code==='BUSY_TRY_AGAIN'?`${error.message} Use Refresh preview to retry.`:error.message);label.hidden=save.hidden=true;refresh.hidden=!!statusOnly||accessErrors.has(error.code);}
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
            markYes(rows){
                const context=options.context();if(!available(context)||options.busy())return;
                const selected=(rows||[]).filter(r=>!r.issue&&r.reccied.trim().toLowerCase()!=='yes');
                if(!selected.length)return;
                if(selected.length>100){options.message('Select at most 100 D numbers for one update.',true);return;}
                open(selected,false);
            },
            editNotes(rows){
                const context=options.context();if(!available(context)||options.busy())return;
                const selected=(rows||[]).filter(r=>!r.issue);
                if(!selected.length)return;
                if(selected.length>100){options.message('Select at most 100 D numbers before editing notes.',true);return;}
                editNotes(selected);
            },
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
