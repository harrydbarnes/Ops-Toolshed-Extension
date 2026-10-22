const {testReccieGoogleConnection} = require('../background/reccie-connection-probe');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('private read-only Google identity test', () => {
    const payload = {ok:true,service:'ops-toolshed-reccies-identity-probe',protocol:1,writeEnabled:false,identityAvailable:true,activeEmail:'test@example.com'};
    beforeEach(() => {
        global.chrome = {permissions:{contains:jest.fn(async()=>true)}};
        global.fetch = jest.fn(async()=>({ok:true,url:'https://script.googleusercontent.com/echo',headers:{get:()=> 'application/json'},json:async()=>payload}));
    });
    afterEach(()=> { delete global.chrome; delete global.fetch; });
    test('uses a fixed GET from the worker with credentials, without accepting caller identity', async()=>{
        await expect(testReccieGoogleConnection()).resolves.toMatchObject({email:'test@example.com',readOnly:true,transport:'extension-service-worker'});
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('https://script.google.com/'),expect.objectContaining({method:'GET',credentials:'include',redirect:'follow'}));
        expect(fetch.mock.calls[0][1].body).toBeUndefined();
    });
    test('does not fetch without site permission',async()=>{
        chrome.permissions.contains.mockResolvedValue(false);
        await expect(testReccieGoogleConnection()).rejects.toThrow('Allow Google script');
        expect(fetch).not.toHaveBeenCalled();
    });
    test.each([
        {url:'https://accounts.google.com/login',type:'text/html',body:payload},
        {url:'https://script.googleusercontent.com/echo',type:'text/html',body:payload},
        {url:'https://script.googleusercontent.com/echo',type:'application/json',body:{...payload,writeEnabled:true}},
        {url:'https://script.googleusercontent.com/echo',type:'application/json',body:{...payload,identityAvailable:false,activeEmail:null}}
    ])('rejects login HTML, wrong versions and absent identity (%j)',async({url,type,body})=>{
        fetch.mockResolvedValue({ok:true,url,headers:{get:()=>type},json:async()=>body});
        await expect(testReccieGoogleConnection()).rejects.toThrow();
    });
    test.each(['test@example.com',''])('server identity comes only from Session and POST cannot write (%s)',email=>{
        const context={Session:{getActiveUser:()=>({getEmail:()=>email})},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}};
        vm.createContext(context);
        vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../integrations/reccie-apps-script/IdentityProbe.gs'),'utf8'),context);
        expect(JSON.parse(context.doGet({parameter:{email:'forged@example.com'}}).value)).toMatchObject({activeEmail:email||null,identityAvailable:!!email,writeEnabled:false});
        expect(JSON.parse(context.doPost().value)).toMatchObject({ok:false,error:'READ_ONLY_PROBE',writeEnabled:false});
    });
});
