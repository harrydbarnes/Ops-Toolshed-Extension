const { JSDOM } = require('jsdom');
const { readScript } = require('../helpers/read-script');
const path = require('path');
const script = readScript(path.resolve(__dirname, '../../features/timesheet-activity.js'));

test('samples only a focused, recently used campaign with a matching header', () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-27T12:00:00Z'));
    const dom = new JSDOM('<div class="buy-details-wrapper"><span class="buy-details-full" data-full-text="CP3BP6L | D/N88/ 1 /216"></span></div>', {url:'https://go.mediaocean.com/campaign-management/#campaign-id=CP3BP6L',runScripts:'outside-only'});
    const sent = jest.fn().mockResolvedValue({});
    dom.window.Date.now = Date.now;
    dom.window.chrome = {storage:{local:{get:(_defaults,cb)=>cb({timesheetTrackingEnabled:true})},onChanged:{addListener(){}}},runtime:{sendMessage:sent}};
    dom.window.opsToolshedExtensionState = {isActive:()=>true};
    Object.defineProperty(dom.window.document,'visibilityState',{value:'visible',configurable:true});
    dom.window.document.hasFocus = () => true;
    dom.window.eval(script);
    jest.advanceTimersByTime(30000); expect(sent).not.toHaveBeenCalled();
    dom.window.document.dispatchEvent(new dom.window.Event('keydown'));
    jest.advanceTimersByTime(30000); expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({campaign:{id:'CP3BP6L',client:'N88',product:'1'},seconds:15});
    dom.window.location.hash = '#campaign-id=OTHER';
    jest.advanceTimersByTime(30000); expect(sent).toHaveBeenCalledTimes(1);
    dom.window.close(); jest.useRealTimers();
});
