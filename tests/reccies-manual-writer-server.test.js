const fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.resolve(__dirname,'../integrations/reccie-manual-writer/Code.gs'),'utf8');
function setup(flags={}){
    let actor='user@example.com',counter=0,locked=false;
    const data=[['Serial Number','Campaign ID Mediaocean','Booking End Date','Reccied','Comments'],['D03120200','CP3G9KS','06/09/2026','No','Existing note'],['D03120201','CP3G9KS','','No','']];
    const req=[['Request ID','Actor','Mode','Report month','Started','State','Results JSON']],audit=[Array(11).fill('Header')],cache=new Map();
    const backgrounds=new Map();
    const tagged=[{id:1,row:data[1],value:'D03120200/CP3G9KS/2026-09'},{id:2,row:data[2],value:'D03120201/CP3G9KS/2026-09'}];
    const props=new Map([['ALLOW_user@example.com','true'],['ALLOW_other@example.com','true'],['MANUAL_WRITES_ENABLED','true'],['AUDIT_SPREADSHEET_ID','audit-book']]);
    const write=jest.fn(addresses=>{addresses.forEach((address,index)=>{if(flags.partial&&index)throw Error('partial write');data[Number(address.slice(1))-1][3]='Yes';});});
    function sheet(matrix,kind){return {
        getDataRange:()=>({getDisplayValues:()=>matrix.map(row=>row.map(String)),getValues:()=>matrix.map(row=>[...row]),getFormulas:()=>matrix.map((row,index)=>row.map((_,col)=>kind==='tracker'&&flags.formula&&index===1&&col===(flags.commentFormula?4:3)?'=A1':''))}),
        getLastRow:()=>matrix.length,getSheetId:()=>1,getMaxRows:()=>matrix.length,
        getConditionalFormatRules:()=>[],setConditionalFormatRules:jest.fn(),
        getRange:(row,col,height=1,width=1)=>({
            setValue:value=>{matrix[row-1][col-1]=value;},setRichTextValue:value=>{matrix[row-1][col-1]=value.text;},
            setBackground:value=>{backgrounds.set(row,Array(width).fill(value));},getBackgrounds:()=>[backgrounds.get(row)||Array(width).fill('#ffffff')],
            getDataValidation:()=>flags.validation?{getCriteriaType:()=> 'other',getCriteriaValues:()=>[['No']]}:null,
            getA1Notation:()=>String.fromCharCode(64+col)+row,
            setValues:values=>{if(kind==='audit'&&flags.failAudit)throw Error('audit unavailable');for(let y=0;y<height;y++){matrix[row-1+y]||=[];for(let x=0;x<width;x++)matrix[row-1+y][col-1+x]=values[y][x];}}
        }),
        getRangeList:addresses=>({setValue:()=>write(addresses)}),getParent:()=>({getSpreadsheetTimeZone:()=> 'Europe/London'})
    };}
    const tracker=sheet(data,'tracker'),requests=sheet(req,'requests'),changes=sheet(audit,'audit');
    const context={Date,Session:{getActiveUser:()=>({getEmail:()=>actor})},PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)??null,setProperty:(key,value)=>props.set(key,value)})},SpreadsheetApp:{newRichTextValue:()=>({setText(text){this.text=text;return this;},build(){return {text:this.text};}}),openById:jest.fn(id=>id==='audit-book'?{getSheetByName:name=>name==='Requests'?requests:changes}:{getSheetByName:()=>tracker}),DataValidationCriteria:{VALUE_IN_LIST:'list'},flush:jest.fn()},LockService:{getScriptLock:()=>({tryLock:()=>{if(locked||flags.busy)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},CacheService:{getScriptCache:()=>({put:(key,value)=>cache.set(key,value),get:key=>cache.get(key),remove:key=>cache.delete(key)})},Utilities:{getUuid:()=>`${String(++counter).padStart(8,'0')}-89ab-cdef-0123-456789abcdef`},console:{error:jest.fn()},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}};
    context.SpreadsheetApp.openById.mockImplementation(id=>id==='audit-book'?{getSheetByName:name=>name==='Requests'?requests:name==='Records'?{getDataRange:()=>({getValues:()=>[['Metadata ID','Sheet ID','Record identity'],...tagged.map(t=>[t.id,1,t.value])]})}:changes}:{getSheetByName:()=>tracker});
    context.Sheets={Spreadsheets:{DeveloperMetadata:{search:()=>({matchedDeveloperMetadata:tagged.filter(t=>data.includes(t.row)).map(t=>({developerMetadata:{metadataId:t.id,location:{dimensionRange:{sheetId:1,dimension:'ROWS',startIndex:data.indexOf(t.row),endIndex:data.indexOf(t.row)+1}}}}))})},Values:{batchUpdateByDataFilter:jest.fn(request=>{
        if(flags.sortAtWrite){data.splice(1,2,data[2],data[1]);flags.sortAtWrite=false;}
        const responses=[];
        request.data.forEach((entry,index)=>{
            const tag=tagged.find(t=>t.id===entry.dataFilter.developerMetadataLookup.metadataId);
            if(!tag||!data.includes(tag.row))return;
            if(flags.partial&&index)throw Error('partial write');
            const values=entry.values[0],row=data.indexOf(tag.row);
            if(values.length===4)write(['D'+(row+1)]);
            else values.forEach((value,col)=>{if(value!==null)tag.row[col]=value;});
            responses.push({updatedRows:1});
        });return {totalUpdatedRows:responses.length,responses};
    })}}};
    vm.createContext(context);vm.runInContext(source,context);
    const post=input=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(input)}}).value);
    const preview=(rows=[{dNumber:'D03120200',campaignId:'CP3G9KS'}],extra={})=>post({operation:'preview',mode:'main',month:'2026-09',rows,...extra});
    const commit=preview=>post({operation:'commit',requestId:preview.requestId,token:preview.token});
    return {context,flags,tagged,backgrounds,data,req,audit,cache,props,write,post,preview,commit,setActor:value=>{actor=value;}};
}
test('preview is read-only; commit saves Yes, reads it back and records actor/before/after',()=>{
    const test=setup(),preview=test.preview();expect(preview.results[0].state).toBe('eligible');expect(test.write).not.toHaveBeenCalled();
    const result=test.commit(preview);expect(result).toMatchObject({ok:true,state:'complete',results:[{state:'updated',before:'No',after:'Yes',confirmed:true}]});expect(test.data[1][3]).toBe('Yes');
    expect(test.audit[1].slice(2,10)).toEqual(['user@example.com','main','2026-09','D03120200','CP3G9KS','No','Yes','intent']);
    expect(test.audit[2][9]).toBe('updated');expect(test.req[1][5]).toBe('complete');
    expect(test.commit(preview).results).toEqual(result.results);expect(test.write).toHaveBeenCalledTimes(1);
});
test('rematches moved rows instead of trusting preview row numbers',()=>{
    const test=setup(),preview=test.preview();test.data.splice(1,0,['D09999999','CPOTHER','06/09/2026','No','Existing note']);
    expect(test.commit(preview).results[0].state).toBe('updated');expect(test.data[1][3]).toBe('No');expect(test.data[2][3]).toBe('Yes');
});
test('a sort after final checking follows the identifier at the write boundary',()=>{
    const t=setup({sortAtWrite:true}),p=t.preview();
    expect(t.commit(p).results[0].confirmed).toBe(true);
    expect(t.data.find(r=>r[0]==='D03120200')[3]).toBe('Yes');
    expect(t.data.find(r=>r[0]==='D03120201')[3]).toBe('No');
});
test('notes and status follow the same identifier during a concurrent sort',()=>{
    const t=setup({sortAtWrite:true}),p=notePreview(t,{after:'Yes',commentsAfter:'Sorted note'});
    expect(t.commit(p).results[0].confirmed).toBe(true);
    expect(t.data.find(r=>r[0]==='D03120200').slice(3)).toEqual(['Yes','Sorted note']);
    expect(t.data.find(r=>r[0]==='D03120201').slice(3)).toEqual(['No','']);
});
test('missing or changed identifiers fail closed without a coordinate fallback',()=>{
    const t=setup(),p=t.preview();t.tagged[0].value='DOTHER/CPOTHER/2026-09';
    expect(t.commit(p).results[0].confirmed).toBe(false);expect(t.write).not.toHaveBeenCalled();
});
test('legacy previews cannot commit after the writer upgrade',()=>{
    const t=setup(),p=t.preview(),key='manual:'+p.requestId,record=JSON.parse(t.cache.get(key));delete record.writerVersion;t.cache.set(key,JSON.stringify(record));
    expect(t.commit(p).error).toBe('PREVIEW_EXPIRED_OR_WRONG_USER');expect(t.write).not.toHaveBeenCalled();
});
test('formula-protected status still exposes its identifier for setup verification',()=>{
    const t=setup({formula:true}),result=t.context.match_(t.context.snapshot_('main'),{dNumber:'D03120200',campaignId:'CP3G9KS'},'2026-09');
    expect(result).toMatchObject({state:'skipped',metadataId:1});expect(t.write).not.toHaveBeenCalled();
});
test('missing metadata never writes to a matched row number',()=>{
    const t=setup();t.tagged.length=0;const p=t.preview();expect(p.results[0].state).toBe('skipped');
    expect(t.commit(p).results[0].confirmed).toBe(false);expect(t.write).not.toHaveBeenCalled();
});

test('setup protects status-only reports without requiring a Comments column',()=>{
    const t=setup();t.data.forEach(row=>row.pop());t.context.console.log=jest.fn();
    const summary=t.context.setupSortSafeTracker();
    expect(summary).toHaveLength(2);expect(summary.every(s=>s.identified===2&&!s.comments)).toBe(true);
    expect(t.props.get('MANUAL_WRITES_ENABLED')).toBe('false');expect(t.write).not.toHaveBeenCalled();
});

test('failed setup leaves writes disabled when an identifier binding changed',()=>{
    const t=setup();t.tagged[0].value='DOTHER/CPOTHER/2026-09';
    expect(()=>t.context.setupSortSafeTracker()).toThrow('RECORD_IDENTIFIER_CHANGED');
    expect(t.props.get('MANUAL_WRITES_ENABLED')).toBe('false');expect(t.write).not.toHaveBeenCalled();
});
test.each(['','unlisted@example.com'])('denies unauthorised identity without reading the tracker (%s)',actor=>{
    const test=setup();test.setActor(actor);expect(test.preview().error).toMatch(/IDENTITY_UNAVAILABLE|ACCESS_DENIED/);expect(test.context.SpreadsheetApp.openById).not.toHaveBeenCalled();
});
test('revocation and write-disable are reread before commit',()=>{
    const test=setup(),preview=test.preview();test.props.set('ALLOW_user@example.com','false');expect(test.commit(preview).error).toBe('ACCESS_DENIED');test.props.set('ALLOW_user@example.com','true');test.props.set('MANUAL_WRITES_ENABLED','false');expect(test.commit(preview).error).toBe('MANUAL_WRITES_DISABLED');expect(test.write).not.toHaveBeenCalled();
});
test('binds preview tokens and receipts to Google identity',()=>{
    const test=setup(),preview=test.preview();test.setActor('other@example.com');expect(test.commit(preview).error).toBe('PREVIEW_EXPIRED_OR_WRONG_USER');test.setActor('user@example.com');test.commit(preview);test.setActor('other@example.com');expect(test.post({operation:'status',requestId:preview.requestId}).error).toBe('ACCESS_DENIED');
});
test.each(['formula','validation'])('does not overwrite protected tracker content (%s)',flag=>{
    const test=setup({[flag]:true}),preview=test.preview();expect(test.commit(preview).results[0].state).toBe('skipped');expect(test.write).not.toHaveBeenCalled();
});
test('skips values changed between preview and commit',()=>{
    const test=setup(),preview=test.preview();test.data[1][3]='';expect(test.commit(preview).results[0]).toMatchObject({state:'skipped',confirmed:false});expect(test.write).not.toHaveBeenCalled();
});
test('skips duplicate or wrong-month matches',()=>{
    const test=setup();test.data.push([...test.data[1]]);expect(test.preview().results[0].state).toBe('skipped');test.data.pop();expect(test.preview(undefined,{month:'2026-10'}).results[0].state).toBe('skipped');
});
test('blank date inherits only a uniform valid month',()=>{
    const test=setup(),selection=[{dNumber:'D03120201',campaignId:'CP3G9KS'}];expect(test.preview(selection).results[0].state).toBe('eligible');test.data.push(['D03120202','CP3G9KS','01/10/2026','No']);expect(test.preview(selection).results[0].state).toBe('skipped');
});
test('returns partial outcomes from real readback after a partial batch failure',()=>{
    const test=setup({partial:true}),preview=test.preview([{dNumber:'D03120200',campaignId:'CP3G9KS'},{dNumber:'D03120201',campaignId:'CP3G9KS'}]);
    const result=test.commit(preview);expect(result.results.map(row=>row.state)).toEqual(['updated','failed']);expect(test.data[1][3]).toBe('Yes');expect(test.data[2][3]).toBe('No');
});
test('audit intent must be durable before any spreadsheet write',()=>{
    const test=setup({failAudit:true}),preview=test.preview();expect(test.commit(preview).ok).toBe(false);expect(test.write).not.toHaveBeenCalled();test.flags.failAudit=false;
    const result=test.post({operation:'status',requestId:preview.requestId});expect(result.state).toBe('complete');expect(result.results[0]).toMatchObject({state:'failed',confirmed:false});
});
test('status safely recovers current Yes after an interrupted response without resending a write',()=>{
    const test=setup({failAudit:true}),preview=test.preview();test.commit(preview);test.flags.failAudit=false;test.data[1][3]='Yes';
    const result=test.post({operation:'status',requestId:preview.requestId});expect(result.results[0]).toMatchObject({state:'already_yes',after:'Yes',confirmed:true});expect(test.write).not.toHaveBeenCalled();
});
test.each([{mode:'automatic'},{month:'2026-13'},{rows:[{dNumber:'bad',campaignId:'CP3G9KS'}]},{rows:Array(101).fill({dNumber:'D03120200',campaignId:'CP3G9KS'})}])('rejects invalid or excessive selection (%j)',extra=>{
    const test=setup();expect(test.preview(undefined,extra).error).toBe('INVALID_SELECTION');expect(test.write).not.toHaveBeenCalled();
});


test('does not confirm a previously Yes row that changes during audit recording',()=>{
    const test=setup();test.data[1][3]='Yes';const preview=test.preview();
    test.context.SpreadsheetApp.flush.mockImplementationOnce(()=>{test.data[1][3]='No';});
    const result=test.commit(preview);expect(result.results[0].confirmed).toBe(false);expect(test.write).not.toHaveBeenCalled();
});

test('rechecks validation after audit intent before saving',()=>{
    const test=setup(),preview=test.preview();
    test.context.SpreadsheetApp.flush.mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{test.flags.validation=true;});
    const result=test.commit(preview);expect(result.results[0].state).toBe('skipped');expect(test.write).not.toHaveBeenCalled();
});

test('automatic audit cause is distinguished from manual attestation',()=>{
    const test=setup(),preview=test.preview(undefined,{cause:'verified'});test.commit(preview);expect(test.audit[1][10]).toBe('Client verified Prisma statuses');
});

function notePreview(t,changes={}) {return t.post({operation:'previewEdit',mode:'main',month:'2026-09',rows:[{dNumber:'D03120200',campaignId:'CP3G9KS',before:'No',after:'No',commentsBefore:'Existing note',commentsAfter:'Existing note\nWaiting on Supplier Spend',...changes}]});}
test('note preview is read-only; manual No and comments save yellow with audited readback',()=>{
 const t=setup(),p=notePreview(t);expect(p.kind).toBe('edit');expect(t.data[1][4]).toBe('Existing note');expect(t.backgrounds.size).toBe(0);
 const result=t.commit(p);expect(result.results[0]).toMatchObject({state:'updated',confirmed:true,after:'No',commentsAfter:'Existing note\nWaiting on Supplier Spend'});expect(t.data[1][3]).toBe('No');expect(t.backgrounds.size).toBe(0);expect(t.audit[1][8]).toContain('Waiting on Supplier Spend');
 expect(t.commit(p).results).toEqual(result.results);
});
test('can explicitly change Yes back to No while saving a note',()=>{const t=setup();t.data[1][3]='Yes';const p=notePreview(t,{before:'Yes'});expect(t.commit(p).results[0].confirmed).toBe(true);expect(t.data[1][3]).toBe('No');});
test('note edit skips concurrent comments and protects formula cells',()=>{
 const t=setup(),p=notePreview(t);t.data[1][4]='Someone else edited';expect(t.commit(p).results[0].state).toBe('skipped');expect(t.data[1][4]).toBe('Someone else edited');
 const f=setup({formula:true,commentFormula:true});expect(notePreview(f).results[0].state).toBe('skipped');
});
test('note preview rejects stale local values, invalid target and formula injection',()=>{
 const t=setup();expect(notePreview(t,{commentsBefore:'Old note'}).results[0].state).toBe('skipped');expect(notePreview(t,{commentsAfter:' =IMPORTXML("x")'}).error).toBe('INVALID_EDIT');expect(notePreview(t,{after:'Maybe'}).error).toBe('INVALID_EDIT');expect(notePreview(t,{commentsAfter:'x'.repeat(2001)}).error).toBe('INVALID_EDIT');
});
test('clearing a comment preserves existing row colour',()=>{const t=setup();t.backgrounds.set(2,Array(5).fill('#abcabc'));const p=notePreview(t,{commentsAfter:''});expect(t.commit(p).results[0].confirmed).toBe(true);expect(t.data[1][4]).toBe('');expect(t.backgrounds.get(2)[0]).toBe('#abcabc');});
test('interrupted note recovery confirms actual fields without replaying edits',()=>{
 const t=setup({failAudit:true}),p=notePreview(t);t.commit(p);t.flags.failAudit=false;t.data[1][4]='Existing note\nWaiting on Supplier Spend';t.backgrounds.set(2,Array(5).fill('#fff2cc'));
 const result=t.post({operation:'status',requestId:p.requestId});expect(result.results[0]).toMatchObject({confirmed:true,after:'No'});expect(t.write).not.toHaveBeenCalled();
});

test('comment text preserves a leading apostrophe literally',()=>{const t=setup(),p=notePreview(t,{commentsAfter:"'Supplier query"});expect(t.commit(p).results[0].confirmed).toBe(true);expect(t.data[1][4]).toBe("'Supplier query");});
