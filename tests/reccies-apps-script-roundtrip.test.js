const fs=require('fs');
const path=require('path');
const vm=require('vm');

describe('Private Apps Script round-trip prototype (not enabled)',()=>{
    function setup(options={}) {
        let value='No';
        const writes=[],cache=new Map();
        const cell={getFormula:()=>options.formula||'',getValue:()=>value,setValue:next=>{writes.push(next);if(next==='No'&&options.restoreFailure)throw Error('simulated restore failure');value=next;},getDataValidation:()=>options.noValidation?null:({getCriteriaType:()=> options.invalidValidation?'other':'list',getCriteriaValues:()=>[['No','Yes']]})};
        const headers=Array(16).fill('');headers[0]='Serial Number';headers[5]='Campaign ID Mediaocean';headers[15]='Reccied';
        const row=Array(16).fill('');row[0]=options.moved?'D09999999':'D03120200';row[5]='CP3G9KS';row[7]='06/09/2026';
        const context={Utilities:{getUuid:()=> '01234567-89ab-cdef-0123-456789abcdef'},CacheService:{getScriptCache:()=>({put:(key,item)=>cache.set(key,item),get:key=>cache.get(key),remove:key=>cache.delete(key)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:jest.fn()})},SpreadsheetApp:{DataValidationCriteria:{VALUE_IN_LIST:'list'},openById:jest.fn(()=>({getSheetByName:name=>name==='Reccie report'?{getRange:a1=>a1==='Q208'?cell:{getDisplayValues:()=>[a1==='B1:Q1'?headers:row]}}:null})),flush:jest.fn(()=>{if(value==='Yes'&&options.flushFailure)throw Error('simulated flush failure');})},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}};
        vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../integrations/reccie-apps-script/PrivateRoundTripTest.gs'),'utf8'),context);
        const token=JSON.parse(context.doGet().value).token;
        const run=(override={})=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({operation:'roundTrip',token,...override})}}).value);
        return {context,run,writes,value:()=>value};
    }
    test('writes only the fixed target and restores No; token cannot be replayed',()=>{
        const test=setup();expect(test.run()).toMatchObject({ok:true,restored:true,original:'No'});
        expect(test.writes).toEqual(['Yes','No']);expect(test.value()).toBe('No');
        expect(test.context.SpreadsheetApp.openById).toHaveBeenCalledWith('1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU');
        expect(test.run().error).toBe('TOKEN_EXPIRED_OR_USED');expect(test.writes).toHaveLength(2);
    });
    test.each([{moved:true},{formula:'=A1'}])('refuses a moved or formula target without writing (%j)',options=>{
        const test=setup(options);expect(test.run().ok).toBe(false);expect(test.writes).toEqual([]);
    });
    test('supports the live table cell with no range validation',()=>{
        const test=setup({noValidation:true});expect(test.run()).toMatchObject({ok:true,restored:true});expect(test.writes).toEqual(['Yes','No']);
    });
    test('rejects an unexpected validation rule',()=>{
        const test=setup({invalidValidation:true});expect(test.run().error).toBe('VALIDATION_CHANGED_NO_WRITE');expect(test.writes).toEqual([]);
    });
    test('restores No when confirming Yes fails',()=>{
        const test=setup({flushFailure:true});expect(test.run()).toMatchObject({ok:false,restored:true});expect(test.value()).toBe('No');
    });
    test('reports a restoration failure explicitly',()=>{
        const test=setup({restoreFailure:true});expect(test.run()).toMatchObject({ok:false,restored:false,error:expect.stringContaining('RESTORE_FAILED')});
    });
    test('refuses unauthorised request shapes before reading the tracker',()=>{
        const test=setup();expect(test.run({operation:'markAllYes'}).ok).toBe(false);expect(test.context.SpreadsheetApp.openById).not.toHaveBeenCalled();
    });
});
