const { readScript } = require('./helpers/read-script');
const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(path.resolve(__dirname,'../meta-access.html'),'utf8');
const script=readScript(path.resolve(__dirname,'../meta-access.js'));
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
describe('Standalone Meta access without report uploads',()=>{
    let dom,chrome,storage;
    beforeEach(()=>{
        dom=new JSDOM(html,{url:'https://extension-preview.test/meta-access.html',runScripts:'outside-only'});
        storage={socialBookingMetaApiCredentials:{accessToken:'old-secret'}};
        chrome={storage:{sync:{get:jest.fn().mockResolvedValue({onboardingAudience:'prisma'})},local:{get:jest.fn(async()=>storage),set:jest.fn(async value=>Object.assign(storage,value)),remove:jest.fn(async key=>delete storage[key])},onChanged:{addListener:jest.fn()}}};
        dom.window.chrome=chrome;
    });
    afterEach(()=>dom.window.close());
    test('never exposes the existing token and needs no report input',async()=>{
        dom.window.eval(script);await flush();
        expect(dom.window.document.getElementById('token').value).toBe('');
        expect(dom.window.document.getElementById('token').type).toBe('password');
        expect(dom.window.document.body.textContent).not.toContain('old-secret');expect(dom.window.document.querySelector('[type="file"]')).toBeNull();
    });
    test('replaces the same saved credential used by campaign checks and clears the input',async()=>{
        dom.window.eval(script);await flush();dom.window.document.getElementById('token').value='new-secret';
        dom.window.document.getElementById('token-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();
        expect(storage.socialBookingMetaApiCredentials.accessToken).toBe('new-secret');expect(dom.window.document.getElementById('token').value).toBe('');
        expect(dom.window.document.getElementById('status').textContent).toContain('Token saved.');
    });
    test('rejects blank tokens and removes the saved credential only on an explicit click',async()=>{
        dom.window.eval(script);await flush();dom.window.document.getElementById('token-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();
        expect(chrome.storage.local.set).not.toHaveBeenCalled();expect(storage.socialBookingMetaApiCredentials.accessToken).toBe('old-secret');
        dom.window.document.getElementById('remove-token').click();await flush();expect(storage.socialBookingMetaApiCredentials).toBeUndefined();
    });
    test('feature mode prevents token edits when Prisma features are disabled',async()=>{
        chrome.storage.sync.get.mockResolvedValue({allFeaturesDisabled:true});dom.window.eval(script);await flush();
        expect(dom.window.document.getElementById('token-form')).toBeNull();expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
});
