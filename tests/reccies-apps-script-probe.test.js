const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Apps Script authentication probe', () => {
    function load() {
        const context = {
            ContentService: {MimeType: {JSON: 'application/json'}, createTextOutput: value => ({
                value, setMimeType(type) { this.type=type; return this; }
            })},
            SpreadsheetApp: new Proxy({}, {get() { throw new Error('Probe must not access the tracker'); }})
        };
        vm.createContext(context);
        vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../integrations/reccie-apps-script/ReadOnlyProbe.gs'),'utf8'),context);
        return context;
    }
    test('returns only protocol health without revealing tracker or user data', () => {
        const output=load().doGet({parameter:{spreadsheetId:'arbitrary',operation:'write'}});
        expect(output.type).toBe('application/json');
        expect(JSON.parse(output.value)).toEqual({ok:true,service:'ops-toolshed-reccies-probe',protocol:1,writeEnabled:false});
    });
    test('refuses write requests regardless of their payload', () => {
        const output=load().doPost({postData:{contents:JSON.stringify({operation:'markYes',dNumbers:['D03120200']})}});
        expect(JSON.parse(output.value)).toMatchObject({ok:false,error:'READ_ONLY_PROBE',writeEnabled:false});
    });
});
