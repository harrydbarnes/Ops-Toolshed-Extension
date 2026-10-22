const fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.resolve(__dirname,'../integrations/reccie-write-pilot/extension');
function worker() {
    let listener;
    const nonce='01234567-89ab-cdef-0123-456789abcdef';
    const fetch=jest.fn(async(url,options)=>({ok:true,url:'https://script.googleusercontent.com/echo',headers:{get:()=> 'application/json'},json:async()=>({ok:true,service:'ops-toolshed-write-pilot',protocol:1,...(options.method==='GET'?{nonce,email:'test@example.com'}:{token:'server-issued-token',original:'No'})})}));
    const context={URL,Date,AbortSignal,crypto:{randomUUID:()=>nonce},fetch,chrome:{runtime:{id:'write-pilot',getURL:path=>`chrome-extension://write-pilot/${path}`,onMessage:{addListener:fn=>listener=fn}}}};
    vm.createContext(context);context.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
    vm.runInContext(fs.readFileSync(path.join(base,'worker.js'),'utf8'),context);
    const sender={id:'write-pilot',url:'chrome-extension://write-pilot/popup.html'};
    const call=request=>new Promise(resolve=>listener({action:'writePilot',...request},sender,resolve));
    return {fetch,call,listener,sender};
}
test('access is a credentialed GET to configured backend, ignoring client identity/endpoint',async()=>{
    const test=worker();expect(await test.call({operation:'access',endpoint:'https://evil.example',email:'forged@example.com'})).toMatchObject({ok:true,data:{email:'test@example.com'}});
    expect(test.fetch.mock.calls[0][0]).toContain('https://script.google.com/a/macros/wppmedia.com/s/');
    expect(test.fetch.mock.calls[0][0]).not.toContain('forged');
    expect(test.fetch.mock.calls[0][1]).toMatchObject({method:'GET',credentials:'include',cache:'no-store'});
});
test('keeps preparation token out of UI response and uses it once, ignoring supplied token',async()=>{
    const test=worker();const prepare=await test.call({operation:'prepare'});expect(prepare.data).not.toHaveProperty('token');
    expect(await test.call({operation:'roundTrip',token:'forged'})).toMatchObject({ok:true});
    expect(JSON.parse(test.fetch.mock.calls[1][1].body)).toEqual({operation:'roundTrip',token:'server-issued-token'});
    expect(await test.call({operation:'roundTrip'})).toMatchObject({ok:false,error:expect.stringContaining('Prepare')});
    expect(test.fetch).toHaveBeenCalledTimes(2);
});
test('rejects untrusted senders and unsupported operations before network access',async()=>{
    const test=worker();expect(test.listener({action:'writePilot',operation:'access'},{...test.sender,url:'https://example.com'},jest.fn())).toBe(false);
    expect(await test.call({operation:'markYes'})).toMatchObject({ok:false});expect(test.fetch).not.toHaveBeenCalled();
});
test('rejects Google login HTML rather than reporting success',async()=>{
    const test=worker();test.fetch.mockResolvedValue({ok:true,url:'https://accounts.google.com/login',headers:{get:()=> 'text/html'}});
    expect(await test.call({operation:'access'})).toMatchObject({ok:false,error:expect.stringContaining('sign-in')});
});
