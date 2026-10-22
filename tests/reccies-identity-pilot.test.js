const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'../integrations/reccie-identity-pilot');
const nonce='01234567-89ab-cdef-0123-456789abcdef';
const endpoint='https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
function server(email='colleague@example.com') {
    const context={Session:{getActiveUser:()=>({getEmail:()=>email})},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}};
    vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8'),context);
    return context;
}
function worker(email='colleague@example.com') {
    const script=server(email),listener=jest.fn();
    const fetch=jest.fn(async(url,options)=>{
        const parsed=new URL(url),parameter=Object.fromEntries(parsed.searchParams);
        const output=options.method==='POST'?script.doPost({}):script.doGet({parameter});
        return {ok:true,status:200,url:'https://script.googleusercontent.com/echo',headers:{get:()=> 'application/json'},json:async()=>JSON.parse(output.value)};
    });
    const context={URL,performance,AbortSignal,crypto:{randomUUID:()=>nonce},fetch,chrome:{runtime:{id:'pilot',getURL:path=>`chrome-extension://pilot/${path}`,onMessage:{addListener:listener}}}};
    vm.createContext(context);
    context.importScripts=file=>vm.runInContext(fs.readFileSync(path.join(root,'extension',file),'utf8'),context);
    vm.runInContext(fs.readFileSync(path.join(root,'extension/worker.js'),'utf8'),context);
    return {context,fetch,listener};
}
test('pilot is isolated: no content scripts, Prisma host or Sheets scope',()=>{
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
    expect(manifest.permissions).toEqual([]);
    expect(manifest.host_permissions).toEqual(['https://script.google.com/*','https://script.googleusercontent.com/*']);
    expect(manifest.content_scripts).toBeUndefined();
    const apps=JSON.parse(fs.readFileSync(path.join(root,'apps-script/appsscript.json'),'utf8'));
    expect(apps.oauthScopes).toEqual(['https://www.googleapis.com/auth/userinfo.email']);
});
test('normal and forged-email GET use Google identity; POST is refused',async()=>{
    const {context,fetch}=worker();
    const report=await context.runIdentityPilot(endpoint);
    expect(report).toMatchObject({ok:true,identityConsistent:true,postRefused:true,writeEnabled:false,transport:'extension-service-worker'});
    expect(report.tests[0].data.activeEmail).toBe('colleague@example.com');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toContain('email=forged-user%40example.invalid');
    expect(fetch.mock.calls.every(([,options])=>options.credentials==='include')).toBe(true);
});
test('missing Google identity fails the pilot',async()=>{
    expect(await worker('').context.runIdentityPilot(endpoint)).toMatchObject({ok:false,identityConsistent:false});
});
test.each(['https://evil.example/macros/s/X/exec','http://script.google.com/macros/s/X/exec',endpoint+'?token=foo',endpoint+'#fragment',endpoint.replace('/exec','/dev')])('rejects unsupported endpoint %s before any network call',async url=>{
    const test=worker();await expect(test.context.runIdentityPilot(url)).rejects.toThrow();expect(test.fetch).not.toHaveBeenCalled();
});
test.each(['html','nonce','protocol'])('rejects untrusted %s response',async kind=>{
    const test=worker();test.fetch.mockResolvedValue({ok:true,url:'https://script.googleusercontent.com/echo',headers:{get:()=>kind==='html'?'text/html':'application/json'},json:async()=>({service:'ops-toolshed-identity-pilot',protocol:kind==='protocol'?2:1,writeEnabled:false,nonce:'wrong'})});
    await expect(test.context.runIdentityPilot(endpoint)).rejects.toThrow();
});
test('worker ignores messages from web pages or other extensions',()=>{
    const test=worker(),handle=test.listener.mock.calls[0][0],respond=jest.fn();
    expect(handle({action:'identityPilot',endpoint},{id:'pilot',url:'https://example.com'},respond)).toBe(false);
    expect(handle({action:'identityPilot',endpoint},{id:'other',url:'chrome-extension://pilot/popup.html'},respond)).toBe(false);
    expect(test.fetch).not.toHaveBeenCalled();
});
test('installed worker always uses the deployed URL, ignoring a supplied endpoint',async()=>{
    const test=worker(),handle=test.listener.mock.calls[0][0];
    const result=await new Promise(resolve=>{
        expect(handle({action:'identityPilot',endpoint:'https://evil.example/'},{id:'pilot',url:'chrome-extension://pilot/popup.html'},resolve)).toBe(true);
    });
    expect(result.ok).toBe(true);
    expect(test.fetch.mock.calls[0][0]).toContain('https://script.google.com/a/macros/wppmedia.com/s/AKfycby7k8fpt90w9_XPXaOwuu4LxUc61OVWNS1k5e4yanNvsgU3OH24k9ULEnrz66P_TJf6/exec');
});
test('server refuses requests without a valid fresh-request nonce',()=>{
    expect(JSON.parse(server().doGet({parameter:{email:'forged@example.com'}}).value)).toMatchObject({ok:false,error:'INVALID_NONCE',writeEnabled:false});
});
